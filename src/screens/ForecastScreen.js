import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Animated, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wind, Waves, Thermometer, Clock, ArrowUp, Heart, Bell } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { SURFLINE_COLORS, getSpotShowName } from '../constants/Spots';
import { fetchSpotForecastByName } from '../services/forecastService';
import { getAlertRule, upsertAlertRule } from '../services/alertRuleService';
import { isCompactLayout } from '../theme/ui';

// Función para convertir dirección a ángulo (invierte para mostrar hacia dónde va, no de dónde viene)
const getDirectionAngle = (direction) => {
  const directions = {
    'N': 180,    // viene del norte, flecha apunta al sur
    'NNE': 202.5,
    'NE': 225,   // viene del noreste, flecha apunta al suroeste
    'ENE': 247.5,
    'E': 270,    // viene del este, flecha apunta al oeste
    'ESE': 292.5,
    'SE': 315,   // viene del sureste, flecha apunta al noroeste
    'SSE': 337.5,
    'S': 0,      // viene del sur, flecha apunta al norte
    'SSW': 22.5,
    'SW': 45,    // viene del suroeste, flecha apunta al noreste
    'WSW': 67.5,
    'W': 90,     // viene del oeste, flecha apunta al este
    'WNW': 112.5,
    'NW': 135,   // viene del noroeste, flecha apunta al sureste
    'NNW': 157.5,
  };
  return directions[direction] || 0;
};

const getOppositeAngle = (degValue) => {
  const deg = Number(degValue);
  if (!Number.isFinite(deg)) return 0;
  return (deg + 180) % 360;
};

const toKph = (kts) => {
  const speed = Number(kts);
  if (!Number.isFinite(speed)) return null;
  return Math.round(speed * 1.852);
};

const getWindGustColor = (kphValue) => {
  const speed = Number(kphValue);
  if (!Number.isFinite(speed)) return '#334155';
  return speed > 11 ? '#DC2626' : '#334155';
};

const getColorByHeight = (heightMeters) => {
  const height = Number(heightMeters);
  if (!Number.isFinite(height)) return '#FFB100'; // naranja por defecto
  if (height <= 1) return '#DC2626'; // rojo
  if (height <= 3) return '#FFB100'; // naranja
  if (height <= 4) return '#00D15D'; // verde
  return '#00A145'; // verde oscuro para 4m+
};

const getColorByStarCount = (starCount) => {
  const stars = Number(starCount);
  if (!Number.isFinite(stars)) return '#FFB100';
  if (stars <= 1) return '#DC2626';
  if (stars <= 3) return '#FFB100';
  if (stars === 4) return '#00D15D';
  return '#00A145';
};

const getColorByRating = (swellHeightM, swellPeriodS, windSpeedKts) => {
  const windKph = toKph(windSpeedKts);
  const stars = getRowStars(swellHeightM, swellPeriodS, windKph);
  return getColorByStarCount(stars);
};

const THREE_HOUR_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21];

const getNzTodayDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

const formatForecastDayLabel = (dateKey, fallbackDayOfWeek = '') => {
  if (!dateKey) return fallbackDayOfWeek || '--';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallbackDayOfWeek || dateKey;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatHourlyHeaderTitle = (dateKey, fallbackDayOfWeek = '') => {
  if (!dateKey) return fallbackDayOfWeek || '--';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallbackDayOfWeek || dateKey;

  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long' });
  const day = parsed.getDate();
  const month = parsed.getMonth() + 1;
  return `${weekday}, ${day}/${month}`;
};

const getHourFromTime = (time) => {
  if (typeof time !== 'string' || time.length < 2) return null;
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : null;
};

const formatHourSlot = (time) => {
  const hour = getHourFromTime(time);
  if (hour === null) return '--';
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return 'Noon';
  return `${hour - 12}pm`;
};

const formatHourSlotVertical = (time) => {
  const label = String(formatHourSlot(time) || '--');
  return label;
};

const getRowStars = (surfHeight, swellPeriodS, windKph) => {
  const surf = Number(surfHeight);
  const period = Number(swellPeriodS);
  const wind = Number(windKph);
  if (!Number.isFinite(surf)) return 1;

  let score = 0;

  // Altura útil y consistente para surf
  if (surf >= 0.8) score += 1;
  if (surf >= 1.4) score += 1;

  // Periodos mayores suelen indicar más energía y mejor forma
  if (Number.isFinite(period)) {
    if (period >= 9) score += 1;
    if (period >= 12) score += 1;
  }

  // Menos viento = mejor calidad de ola
  if (Number.isFinite(wind)) {
    if (wind <= 18) score += 1;
    if (wind <= 10) score += 1;
  }

  return Math.max(1, Math.min(5, score));
};

const formatShortDate = (dateKey) => {
  if (!dateKey) return '';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
};

const formatHeightRangeMeters = (heightValue) => {
  if (heightValue === null || heightValue === undefined) return '--';
  const raw = String(heightValue).trim();
  if (!raw || raw === '--') return '--';

  // If there is already a unit, keep it unchanged.
  if (/(m|ft|pies|metros)/i.test(raw)) return raw;
  return `${raw} m`;
};

const formatSurfRange = (surfHeight) => {
  const value = Number(surfHeight);
  if (!Number.isFinite(value)) return '--';

  const min = Math.max(0, value - 0.2);
  const max = value + 0.2;
  return `${min.toFixed(1)}-${max.toFixed(1)}`;
};

const DirectionTriangle = ({ angle = 0, color = '#0F172A', size = 14 }) => (
  <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size * 0.45,
        borderRightWidth: size * 0.45,
        borderBottomWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  </View>
);

function SkeletonBlock({ style }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

export default function ForecastScreen({
  spot,
  onBack,
  authUser,
  isFavorite = false,
  onToggleFavorite = () => {},
}) {
  const [liveSpot, setLiveSpot] = useState(null);
  const [loadingLiveForecast, setLoadingLiveForecast] = useState(false);
  const [isSpotAlertOn, setIsSpotAlertOn] = useState(false);
  const [savingSpotAlert, setSavingSpotAlert] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const compact = isCompactLayout(screenWidth);
  const spotTitle = getSpotShowName(spot);
  const isVeryLongTitle = spotTitle.length > 22;
  const isLongTitle = spotTitle.length > 16;

  useEffect(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [spot?.id]);

  useEffect(() => {
    let mounted = true;

    const loadLiveForecast = async () => {
      if (!spot?.name) {
        if (mounted) {
          setLiveSpot(null);
        }
        return;
      }

      setLoadingLiveForecast(true);
      const live = await fetchSpotForecastByName(spot.name, 16);

      if (mounted) {
        setLiveSpot(live);
        setLoadingLiveForecast(false);
      }
    };

    loadLiveForecast();

    return () => {
      mounted = false;
    };
  }, [spot?.name]);

  useEffect(() => {
    let mounted = true;

    const loadSpotAlertState = async () => {
      if (!authUser?.id || !spot?.name) {
        if (mounted) setIsSpotAlertOn(false);
        return;
      }

      const rule = await getAlertRule(authUser.id);
      if (!mounted) return;

      const selectedSpots = Array.isArray(rule?.spot_names) ? rule.spot_names : [];
      const hasSpotEnabled = Boolean(rule?.is_armed) && selectedSpots.includes(spot.name);
      setIsSpotAlertOn(hasSpotEnabled);
    };

    loadSpotAlertState();

    return () => {
      mounted = false;
    };
  }, [authUser?.id, spot?.name]);

  if (!spot) return null;

  const displaySpot = liveSpot;
  const displayForecast = displaySpot?.forecast || [];
  const nzTodayDateKey = getNzTodayDateKey();
  const upcomingForecast = displayForecast.filter((day) => {
    if (!day?.date || !nzTodayDateKey) return false;
    return day.date >= nzTodayDateKey;
  });
  const currentForecastDay = upcomingForecast[0] || null;
  const heroHeightLabel = currentForecastDay
    ? `${currentForecastDay?.height?.min ?? '--'}-${currentForecastDay?.height?.max ?? '--'} m`
    : formatHeightRangeMeters(displaySpot?.height);
  const hasLiveForecast = Boolean(displaySpot && upcomingForecast.length);
  const showForecastSkeleton = loadingLiveForecast && !hasLiveForecast;
  const hourlyForecastByDay = upcomingForecast
    .slice(0, 16)
    .map((day) => {
      const hourlyBySlot = new Map();
      if (Array.isArray(day?.hourlyData)) {
        day.hourlyData.forEach((hour) => {
          const parsedHourRaw = getHourFromTime(hour?.time);
          if (parsedHourRaw === null) return;

          // Normalize midnight values like 24:00 to 00:00.
          const parsedHour = parsedHourRaw % 24;
          const slot = Math.floor(parsedHour / 3) * 3;
          const distanceToSlot = Math.abs(parsedHour - slot);
          const existing = hourlyBySlot.get(slot);
          const hasWindValue = hour?.windSpeed !== null && hour?.windSpeed !== undefined;
          const existingHasWindValue = existing?.windSpeed !== null && existing?.windSpeed !== undefined;

          if (
            !existing ||
            distanceToSlot < existing.distanceToSlot ||
            (distanceToSlot === existing.distanceToSlot && hasWindValue && !existingHasWindValue)
          ) {
            hourlyBySlot.set(slot, {
              ...hour,
              distanceToSlot,
            });
          }
        });
      }

      const entries = THREE_HOUR_SLOTS.map((slot) => {
        const slotHour = hourlyBySlot.get(slot);
        if (slotHour) {
          const { distanceToSlot, ...rest } = slotHour;
          return rest;
        }

        return {
          time: `${String(slot).padStart(2, '0')}:00`,
          surfHeight: null,
          swellHeight: null,
          swellPeriod: null,
          swellDirection: null,
          windSpeed: null,
          windGust: null,
          windDirection: null,
          windDirectionDeg: null,
          isPlaceholder: true,
        };
      });

      return {
        ...day,
        dayLabel: formatForecastDayLabel(day?.date, day?.dayOfWeek),
        entries,
      };
    });

  const handleToggleFavorite = () => {
    onToggleFavorite?.(spot?.name);
  };

  const handleToggleSpotAlert = async () => {
    if (!authUser?.id || !spot?.name || savingSpotAlert) return;

    setSavingSpotAlert(true);
    const currentRule = await getAlertRule(authUser.id);
    const currentSpots = Array.isArray(currentRule?.spot_names) ? currentRule.spot_names : [];

    const hasSpot = currentSpots.includes(spot.name);
    const nextSpotNames = hasSpot
      ? currentSpots.filter((name) => name !== spot.name)
      : [...currentSpots, spot.name];

    const result = await upsertAlertRule({
      userId: authUser.id,
      spotNames: nextSpotNames,
      minRating: 'GOOD',
      maxWindKts: 99,
      isArmed: nextSpotNames.length > 0,
    });

    if (result.ok) {
      setIsSpotAlertOn(nextSpotNames.includes(spot.name));
    }

    setSavingSpotAlert(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.atmosphereOne} pointerEvents="none" />
      <View style={styles.atmosphereTwo} pointerEvents="none" />

      {/* Header */}
      <AppHeader
        title={spotTitle}
        compact={compact}
        sideSlotWidth={84}
        titleStyle={isVeryLongTitle ? styles.headerTitleVeryLong : isLongTitle ? styles.headerTitleLong : null}
        onBack={onBack}
        rightElement={(
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleToggleSpotAlert}
              style={styles.actionButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Bell
                color={isSpotAlertOn ? '#FFB100' : savingSpotAlert ? '#627486' : '#8EA2B8'}
                size={20}
                fill={isSpotAlertOn ? '#FFB100' : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.actionButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Heart
                color={isFavorite ? '#00D15D' : '#8EA2B8'}
                size={20}
                fill={isFavorite ? '#00D15D' : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        )}
      />

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        style={{ opacity: contentOpacity }}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={[styles.heroCard, compact ? styles.heroCardCompact : null]}>
            <View style={styles.heroTopRow}>
              <View
                style={[
                  styles.ratingBadge,
                  { backgroundColor: getColorByRating(currentForecastDay?.primarySwell?.height, currentForecastDay?.primarySwell?.period, currentForecastDay?.windSpeed) },
                ]}
              >
                <Text style={styles.ratingText}>{displaySpot?.rating || '--'}</Text>
              </View>
              <Text style={styles.liveTag}>LIVE</Text>
            </View>
            {showForecastSkeleton ? (
              <SkeletonBlock style={[styles.waveHeightSkeleton, compact ? styles.waveHeightSkeletonCompact : null]} />
            ) : (
              <Text style={[styles.waveHeightValue, compact ? styles.waveHeightValueCompact : null]}>{heroHeightLabel}</Text>
            )}
            <View style={styles.metricsRow}>
              <View style={styles.metricPill}>
                <Waves size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>SWELL</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                  <Text style={styles.metricPillValue}>{currentForecastDay?.primarySwell?.height ?? '0.5'}m</Text>
                )}
              </View>
              <View style={styles.metricPill}>
                <Clock size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>PERIODO</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                    <Text style={styles.metricPillValue}>{currentForecastDay?.primarySwell?.period ?? '13'}s</Text>
                )}
              </View>
              <View style={styles.metricPill}>
                <Wind size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>VIENTO</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                    <Text style={styles.metricPillValue}>{currentForecastDay?.windSpeed ?? '--'}kts</Text>
                )}
              </View>
            </View>
            <Text style={styles.liveHint}>
              {loadingLiveForecast
                ? 'Actualizando forecast real...'
                : hasLiveForecast
                  ? 'Forecast real activo'
                  : 'Sin forecast real disponible para este spot'}
            </Text>
          </View>
        </View>

        {/* Hourly Forecast Table by Day (every 3h) */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>PRONOSTICO DIARIO CADA 3 HORAS</Text>

        {showForecastSkeleton ? (
          [0, 1].map((idx) => (
            <View key={`hourly-skeleton-${idx}`} style={styles.dayHourlySkeletonCard}>
              <View style={styles.dayHourlyHeader}>
                <SkeletonBlock style={styles.dayTitleSkeleton} />
                <SkeletonBlock style={styles.daySubSkeleton} />
              </View>
              {[0, 1, 2, 3].map((rowIdx) => (
                <View key={`hourly-skeleton-row-${rowIdx}`} style={styles.dayHourlySkeletonRow}>
                  <SkeletonBlock style={styles.hourSkeletonCell} />
                  <SkeletonBlock style={styles.surfSkeletonCell} />
                  <SkeletonBlock style={styles.swellSkeletonCell} />
                  <SkeletonBlock style={styles.windSkeletonCell} />
                </View>
              ))}
            </View>
          ))
        ) : !hasLiveForecast || !hourlyForecastByDay.length ? (
          <Text style={styles.emptyForecastText}>Sin datos de forecast disponibles.</Text>
        ) : (
          hourlyForecastByDay.map((day, dayIdx) => (
            <View key={`${day.date}-${dayIdx}`} style={styles.dayHourlyCard}>
              <View style={styles.dayHourlyHeader}>
                <Text style={styles.dayHourlyTitle}>{formatHourlyHeaderTitle(day.date, day.dayOfWeek || day.dayLabel)}</Text>
              </View>
                <View style={styles.tableContainerNoScroll}>
                  <View style={styles.forecastTable}>
                    <View style={styles.tableHeaderRow}>
                      <View style={[styles.tableCell, styles.hourCell, styles.headerHourCell]} />
                      <View style={[styles.tableCell, styles.surfCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>SURF (m)</Text>
                      </View>
                      <View style={[styles.tableCell, styles.swellCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>SWELL</Text>
                      </View>
                      <View style={[styles.tableCell, styles.windCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>WIND</Text>
                      </View>
                    </View>

                    {day.entries.map((hour, idx) => {
                      const kph = toKph(hour.windSpeed);
                      const gustKph = toKph(hour.windGust);
                      const starCount = getRowStars(hour.surfHeight ?? hour.swellHeight, hour.swellPeriod, kph);
                      const starColor = getColorByStarCount(starCount);
                      const swellDeg = Number(hour.swellDirectionDeg);
                      const swellAngle = Number.isFinite(swellDeg)
                        ? getOppositeAngle(swellDeg)
                        : getDirectionAngle(hour.swellDirection);
                      const windAngle = Number.isFinite(Number(hour.windDirectionDeg))
                        ? getOppositeAngle(hour.windDirectionDeg)
                        : getDirectionAngle(hour.windDirection);

                      return (
                        <View
                          key={`${day.date}-${hour.time}-${idx}`}
                          style={[
                            styles.tableDataRow,
                            idx % 2 === 1 ? styles.tableDataRowAlt : null,
                            compact ? styles.tableDataRowCompact : null,
                            hour?.isPlaceholder ? styles.tableDataRowPlaceholder : null,
                          ]}
                        >
                          <View style={[styles.tableCell, styles.hourCell, styles.hourBandCell, idx % 2 === 1 ? styles.hourBandCellAlt : null]}>
                            <View style={styles.hourMetaVerticalRow}>
                              <View style={styles.verticalHourContainer}>
                                <Text style={[styles.tableHourText, styles.verticalHourText]}>{formatHourSlotVertical(hour.time)}</Text>
                              </View>
                              <View style={styles.ratingBlocksRow}>
                                {Array.from({ length: 5 }, (_item, blockIdx) => (
                                  <View
                                    key={`rating-block-${day.date}-${hour.time}-${idx}-${blockIdx}`}
                                    style={[
                                      styles.ratingBlock,
                                      (5 - blockIdx) <= starCount
                                        ? { backgroundColor: starColor }
                                        : styles.ratingBlockEmpty,
                                      blockIdx === 0 ? styles.ratingBlockFirst : null,
                                      blockIdx === 4 ? styles.ratingBlockLast : null,
                                    ]}
                                  />
                                ))}
                              </View>
                            </View>
                          </View>

                          <View style={[styles.tableCell, styles.surfCell, styles.surfBandCell]}>
                            <View style={styles.surfValuePanel}>
                              <Text style={[styles.metricValue, styles.surfMetricValue]}>
                                {formatSurfRange(hour.surfHeight ?? hour.swellHeight)}
                              </Text>
                            </View>
                          </View>

                          <View style={[styles.tableCell, styles.swellCell, styles.swellBandCell, idx % 2 === 1 ? styles.swellBandCellAlt : null]}>
                            <View style={styles.swellGridRow}>
                              <View style={styles.swellGridCol}>
                                <Text style={styles.swellDataValue}>{hour.swellHeight ?? '--'}<Text style={styles.swellUnitTiny}>m</Text></Text>
                              </View>
                              <View style={styles.swellGridCol}>
                                <Text style={styles.swellDataValue}>{hour.swellPeriod ?? '--'}<Text style={styles.swellUnitTiny}>s</Text></Text>
                              </View>
                              <View style={styles.swellGridCol}>
                                <DirectionTriangle
                                  angle={swellAngle}
                                  color="#3B4A59"
                                  size={16}
                                />
                                <Text style={styles.swellDirectionDeg}>{Number.isFinite(swellDeg) ? `${Math.round(swellDeg)}°` : '--'}</Text>
                              </View>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.tableCell,
                              styles.windCell,
                              styles.windCombinedCell,
                            ]}
                          >
                            <View style={styles.windMainInfo}>
                              <View style={styles.windSpeedRow}>
                                <Text style={styles.windSpeedText}>{kph ?? '--'}</Text>
                                <View style={styles.windUnitStack}>
                                  <Text style={[styles.windGustExponent, { color: getWindGustColor(gustKph) }]}>{Number.isFinite(gustKph) ? gustKph : '--'}</Text>
                                  <Text style={styles.windUnit}>kph</Text>
                                </View>
                              </View>
                            </View>
                            <View style={[styles.windArrowPanel, idx % 2 === 0 ? styles.windArrowPanelEven : null]}>
                              <View style={{ transform: [{ rotate: `${windAngle}deg` }] }}>
                                <ArrowUp size={24} color="#0F172A" />
                              </View>
                              <Text style={styles.windArrowLabel}>{hour.windDirection ?? '--'}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
            </View>
          ))
        )}

      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  atmosphereOne: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#0D3147',
    opacity: 0,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -180,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#0A2436',
    opacity: 0,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  actionButton: { padding: 4, minWidth: 24, alignItems: 'center' },
  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 8,
  },
  heroCard: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCardCompact: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  ratingText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  liveTag: {
    color: '#2F5D8A',
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#EFF6FF',
    letterSpacing: 0.8,
  },
  waveHeightValue: {
    color: '#0F172A',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  waveHeightValueCompact: {
    fontSize: 32,
  },
  metricsRow: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },
  metricPillLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metricPillValue: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  liveHint: { color: '#64748B', fontSize: 12, marginTop: 10 },
  skeletonBlock: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  waveHeightSkeleton: {
    marginTop: 4,
    width: 118,
    height: 40,
    borderRadius: 8,
  },
  waveHeightSkeletonCompact: {
    width: 100,
    height: 34,
  },
  metricValueSkeleton: {
    width: 54,
    height: 14,
    borderRadius: 5,
  },

  // Forecast Table (Horizontal)
  sectionTitle: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitleCompact: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 10,
  },
  headerTitleLong: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  headerTitleVeryLong: {
    fontSize: 12,
    letterSpacing: 0,
  },
  tableContainer: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  tableContainerNoScroll: {
    marginHorizontal: 0,
    marginBottom: 0,
    width: '100%',
  },
  tableContent: {
    paddingRight: 0,
  },
  dayHourlyCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },
  dayHourlySkeletonCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayTitleSkeleton: {
    width: 130,
    height: 14,
  },
  daySubSkeleton: {
    width: 68,
    height: 12,
  },
  dayHourlySkeletonRow: {
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hourSkeletonCell: {
    width: 32,
    height: 40,
  },
  surfSkeletonCell: {
    flex: 1,
    height: 38,
  },
  swellSkeletonCell: {
    flex: 1.3,
    height: 38,
  },
  windSkeletonCell: {
    flex: 1.5,
    height: 38,
  },
  sixteenDaySkeletonCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  dailySkeletonRow: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dailyLeftSkeleton: {
    width: 74,
    height: 16,
  },
  dailyMidSkeleton: {
    flex: 1,
    height: 16,
  },
  dailyRightSkeleton: {
    width: 64,
    height: 16,
  },
  dayHourlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 14,
  },
  dayHourlyTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dayHourlySub: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  forecastTable: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E0E7',
    paddingVertical: 0,
    minHeight: 74,
    marginLeft: 12,
  },
  tableDataRowAlt: {
    backgroundColor: '#FDFEFE',
  },
  tableDataRowPlaceholder: {
    opacity: 0.68,
  },
  tableDataRowCompact: {
    minHeight: 62,
  },
  tableCell: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCellDay: {
    minWidth: 58,
  },
  tableCellMetric: {
    minWidth: 64,
  },
  hourCell: {
    flex: 0.9,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingVertical: 9,
  },
  hourMetaVerticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    width: '100%',
    paddingLeft: 2,
  },
  surfCell: {
    flex: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swellCell: {
    flex: 1.75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  windCell: {
    flex: 2.1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerHourCell: {
    backgroundColor: '#FFFFFF',
  },
  headerMainCell: {
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  tableDayText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  tableDateText: {
    color: '#7B92A3',
    fontSize: 9,
  },
  ratingPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  ratingPillText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },
  metricValue: {
    color: '#17212B',
    fontSize: 14,
    fontWeight: '900',
  },
  surfMetricValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  unitSmall: {
    color: '#5F6C78',
    fontSize: 10,
    fontWeight: '600',
  },
  surfUnitSmall: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },
  windSpeedCell: {
    minWidth: 70,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
  },
  windSpeedText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  windSpeedRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  windUnitStack: {
    marginLeft: 2,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  windUnit: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },
  windGustExponent: {
    color: '#334155',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 8,
    marginBottom: -1,
  },
  hourBandCell: {
    backgroundColor: '#FFFFFF',
  },
  hourBandCellAlt: {
    backgroundColor: '#FFFFFF',
  },
  surfBandCell: {
    backgroundColor: '#FFFFFF',
  },
  surfValuePanel: {
    width: 85,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  swellBandCell: {
    backgroundColor: '#FFFFFF',
  },
  swellBandCellAlt: {
    backgroundColor: '#FFFFFF',
  },
  combinedCell: {
    alignItems: 'flex-start',
    gap: 3,
  },
  swellGridRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  swellGridCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swellGridHeaderText: {
    color: '#334155',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  swellDataValue: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '600',
  },
  swellUnitTiny: {
    color: '#5F6C78',
    fontSize: 8,
    fontWeight: '600',
  },
  swellSecondary: {
    color: '#3B4A59',
    fontSize: 11,
    fontWeight: '700',
  },
  swellDirectionDeg: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  swellSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  directionTriangle: {
    fontWeight: '900',
    lineHeight: 14,
  },
  ratingBlocksRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    marginLeft: -2,
  },
  ratingBlock: {
    width: 7,
    height: 9,
    backgroundColor: '#00A145',
  },
  ratingBlockEmpty: {
    backgroundColor: '#CBD5E1',
  },
  ratingBlockFirst: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  ratingBlockLast: {
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  windCombinedCell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 2,
  },
  windMainInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  windInlineRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  windArrowPanel: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  windArrowPanelEven: {
    backgroundColor: '#E2E8F0',
  },
  windDirectionLine: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
  },
  windArrowLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  emptyForecastText: { color: '#64748B', fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },

  tableHourText: {
    color: '#495867',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 12,
  },
  verticalHourContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    transform: [{ rotate: '270deg' }],
    width: 30,
    height: 18,
  },
  verticalHourChar: {
    marginVertical: -2,
  },
  verticalHourText: {
    textAlign: 'center',
    lineHeight: 14,
    width: 30,
  },
  verticalHeaderText: {
    transform: [{ rotate: '90deg' }],
    width: 42,
    textAlign: 'center',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    padding: 6,
  },
  modalTitle: { color: '#0F172A', fontSize: 18, fontWeight: 'bold' },
  modalContent: { paddingHorizontal: 20, paddingVertical: 20 },

  // Info Cards
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  ratingBadgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
    minHeight: 60,
  },
  ratingBadgeLargeText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 14,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  infoLabel: {
    color: '#8E9196',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  infoValue: { color: '#0F172A', fontSize: 20, fontWeight: 'bold' },
  infoSmall: { color: '#8E9196', fontSize: 11, marginTop: 4 },

  swellDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },

  conditionsRow: { flexDirection: 'row', gap: 12 },

  // Tide Graph
  tideGraph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginVertical: 16,
    position: 'relative',
  },
  tideBar: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 2,
    minHeight: 2,
  },
  tideIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 20,
    alignItems: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D15D',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  tideInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  tideTimeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  timeLabelSmall: { color: '#484F58', fontSize: 10, fontWeight: 'bold' },

  // Direction Views
  directionView: {
    alignItems: 'center',
    gap: 8,
    overflow: 'visible',
  },
  windDirectionView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'visible',
  },
  directionArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});