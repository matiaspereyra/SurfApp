import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Dimensions,
  Animated, Modal, PanResponder, useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wind, Waves, Thermometer, Clock, X, ArrowUp, Heart, Bell } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { SURFLINE_COLORS, getSpotShowName } from '../constants/Spots';
import { fetchSpotForecastByName } from '../services/forecastService';
import { getAlertRule, upsertAlertRule } from '../services/alertRuleService';
import { isCompactLayout } from '../theme/ui';

const { width, height } = Dimensions.get('window');

// Color para velocidad de viento
const getWindColorBg = (windSpeed) => {
  const speedKts = Number(windSpeed);
  if (isNaN(speedKts) || windSpeed === null || windSpeed === undefined) return '#1f2937';
  const speedKph = speedKts * 1.852;
  if (speedKph < 20) return '#16A34A';
  if (speedKph < 35) return '#EA580C';
  return '#DC2626';
};

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

const toKph = (kts) => {
  const speed = Number(kts);
  if (!Number.isFinite(speed)) return null;
  return Math.round(speed * 1.852);
};

const THREE_HOUR_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21];

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

const getRowStars = (surfHeight, windKph) => {
  const surf = Number(surfHeight);
  const wind = Number(windKph);
  if (!Number.isFinite(surf)) return '☆☆☆☆☆';

  let score = 0;
  if (surf >= 0.8) score += 1;
  if (surf >= 1.2) score += 1;
  if (surf >= 1.8) score += 1;
  if (Number.isFinite(wind)) {
    if (wind <= 20) score += 1;
    if (wind <= 12) score += 1;
  }

  const clamped = Math.max(1, Math.min(5, score));
  return `${'★'.repeat(clamped)}${'☆'.repeat(5 - clamped)}`;
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

// Pantalla Modal de Detalles del Día
function DayDetailModal({ visible, day, spot, onClose }) {
  const [tidePosition, setTidePosition] = useState(0);
  const panResponderRef = useRef(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && day) {
      panResponderRef.current = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (evt, gestureState) => {
          const graphWidth = width - 60;
          const touchX = gestureState.moveX;
          const normalizedPosition = Math.max(0, Math.min(1, (touchX - 30) / graphWidth));
          setTidePosition(normalizedPosition);
        },
      });
    }
  }, [visible, day]);

  if (!day) return null;

  const graphHeight = 180;
  const graphWidth = width - 60;
  const currentTideIndex = Math.max(0, Math.min(day.tideData.length - 1, Math.floor(tidePosition * (day.tideData.length - 1))));
  const currentTidePoint = day.tideData[currentTideIndex] || { time: '--:--', height: 1 };
  const currentHeight = currentTidePoint?.height || 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 10 }]}> 
          <Text style={styles.modalTitle}>{day.dayOfWeek} - {day.date}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X color="white" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {/* Rating y Altura */}
          <View style={[styles.infoCard, { borderColor: SURFLINE_COLORS[day.rating] }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.ratingBadgeLarge, { backgroundColor: SURFLINE_COLORS[day.rating] }]}>
                <Text style={styles.ratingBadgeLargeText}>{day.rating}</Text>
              </View>
              <View>
                <Text style={styles.infoLabel}>ALTURA</Text>
                <Text style={styles.infoValue}>{day.height.min}-{day.height.max}m</Text>
              </View>
            </View>
          </View>

          {/* Swell Primario */}
          <View style={[styles.infoCard, { borderColor: '#00D15D' }]}>
            <Text style={styles.infoLabel}>SWELL PRIMARIO</Text>
            <View style={styles.swellDetails}>
              <View>
                <Text style={styles.infoValue}>{day.primarySwell.height}m</Text>
                <Text style={styles.infoSmall}>Altura</Text>
              </View>
              <View>
                <Text style={styles.infoValue}>{day.primarySwell.period}s</Text>
                <Text style={styles.infoSmall}>Período</Text>
              </View>
              <View style={styles.directionView}>
                <View style={{ transform: [{ rotate: `${getDirectionAngle(day.primarySwell.direction)}deg` }] }}>
                  <ArrowUp 
                    size={20} 
                    color="#00D15D"
                  />
                </View>
                <Text style={styles.infoValue}>{day.primarySwell.direction}</Text>
                <Text style={styles.infoSmall}>Dirección</Text>
              </View>
            </View>
          </View>

          {/* Swell Secundario */}
          <View style={[styles.infoCard, { borderColor: '#FFB100' }]}>
            <Text style={styles.infoLabel}>SWELL SECUNDARIO</Text>
            <View style={styles.swellDetails}>
              <View>
                <Text style={styles.infoValue}>{day.secondarySwell.height}m</Text>
                <Text style={styles.infoSmall}>Altura</Text>
              </View>
              <View>
                <Text style={styles.infoValue}>{day.secondarySwell.period}s</Text>
                <Text style={styles.infoSmall}>Período</Text>
              </View>
              <View style={styles.directionView}>
                <View style={{ transform: [{ rotate: `${getDirectionAngle(day.secondarySwell.direction)}deg` }] }}>
                  <ArrowUp 
                    size={20} 
                    color="#FFB100"
                  />
                </View>
                <Text style={styles.infoValue}>{day.secondarySwell.direction}</Text>
                <Text style={styles.infoSmall}>Dirección</Text>
              </View>
            </View>
          </View>

          {/* Condiciones */}
          <View style={styles.conditionsRow}>
            <View style={[styles.infoCard, { flex: 1, borderColor: '#FFB100' }]}>
              <Text style={styles.infoLabel}>VIENTO</Text>
              <Text style={styles.infoValue}>{day.windSpeed}kts</Text>
              <View style={styles.windDirectionView}>
                <View style={{ transform: [{ rotate: `${getDirectionAngle(day.windDirection)}deg` }] }}>
                  <ArrowUp 
                    size={16} 
                    color="#FFB100"
                  />
                </View>
                <Text style={styles.infoSmall}>{day.windDirection}</Text>
              </View>
            </View>
            <View style={[styles.infoCard, { flex: 1, borderColor: '#44ADEE' }]}>
              <Text style={styles.infoLabel}>AGUA</Text>
              <Text style={styles.infoValue}>{day.waterTemp}°C</Text>
              <Text style={styles.infoSmall}>{day.neopreneThickness}</Text>
            </View>
          </View>

          {/* Gráfico de Mareas Interactivo */}
          <View style={[styles.infoCard, { borderColor: '#44ADEE' }]}>
            <Text style={styles.infoLabel}>MAREA - ARRASTRA PARA VER LA HORA</Text>
            
            {/* Gráfico SVG simulado con barras */}
            <View 
              style={[styles.tideGraph, { height: graphHeight, width: graphWidth }]}
              {...(panResponderRef.current?.panHandlers || {})}
            >
              {/* Barras de marea */}
              {day.tideData.map((point, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.tideBar,
                    {
                      height: (point.height / 2) * graphHeight,
                      backgroundColor:
                        idx === Math.floor(tidePosition * (day.tideData.length - 1))
                          ? '#00D15D'
                          : '#1A3646',
                    },
                  ]}
                />
              ))}
              
              {/* Indicador de posición actual */}
              <View
                style={[
                  styles.tideIndicator,
                  {
                    left: tidePosition * graphWidth,
                  },
                ]}
              >
                <View style={styles.indicatorDot} />
              </View>
            </View>

            {/* Información de la hora actual en marea */}
            <View style={styles.tideInfoBox}>
              <Text style={styles.infoValue}>{currentTidePoint?.time || '--:--'}</Text>
              <Text style={styles.infoSmall}>{currentHeight.toFixed(2)}m - {currentHeight > 1.5 ? 'Pleamar' : 'Bajamar'}</Text>
            </View>

            {/* Escalas de hora */}
            <View style={styles.tideTimeLabels}>
              <Text style={styles.timeLabelSmall}>00:00</Text>
              <Text style={styles.timeLabelSmall}>06:00</Text>
              <Text style={styles.timeLabelSmall}>12:00</Text>
              <Text style={styles.timeLabelSmall}>18:00</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ForecastScreen({
  spot,
  onBack,
  authUser,
  isFavorite = false,
  onToggleFavorite = () => {},
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
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
    setModalVisible(false);
    setSelectedDay(null);
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
  const heroColor = SURFLINE_COLORS[displaySpot?.rating] || SURFLINE_COLORS.FAIR;
  const heroHeightLabel = formatHeightRangeMeters(displaySpot?.height);
  const hasLiveForecast = Boolean(displaySpot && displayForecast.length);
  const hourlyForecastByDay = displayForecast
    .slice(0, 16)
    .map((day) => {
      const hourlyBySlot = new Map();
      if (Array.isArray(day?.hourlyData)) {
        day.hourlyData.forEach((hour) => {
          const parsedHour = getHourFromTime(hour?.time);
          if (parsedHour !== null && parsedHour % 3 === 0 && !hourlyBySlot.has(parsedHour)) {
            hourlyBySlot.set(parsedHour, hour);
          }
        });
      }

      const entries = THREE_HOUR_SLOTS.map((slot) => {
        const slotHour = hourlyBySlot.get(slot);
        if (slotHour) return slotHour;
        return {
          time: `${String(slot).padStart(2, '0')}:00`,
          surfHeight: null,
          swellHeight: null,
          swellPeriod: null,
          swellDirection: null,
          windSpeed: null,
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

  const openDayDetail = (day) => {
    setSelectedDay(day);
    setModalVisible(true);
  };

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
                  { backgroundColor: heroColor },
                ]}
              >
                <Text style={styles.ratingText}>{displaySpot?.rating || '--'}</Text>
              </View>
              <Text style={styles.liveTag}>LIVE</Text>
            </View>
            <Text style={[styles.waveHeightValue, compact ? styles.waveHeightValueCompact : null]}>{heroHeightLabel}</Text>
            <View style={styles.metricsRow}>
              <View style={styles.metricPill}>
                <Waves size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>SWELL</Text>
                <Text style={styles.metricPillValue}>{displayForecast?.[0]?.primarySwell?.height ?? '0.5'}m</Text>
              </View>
              <View style={styles.metricPill}>
                <Clock size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>PERIODO</Text>
                <Text style={styles.metricPillValue}>{displayForecast?.[0]?.primarySwell?.period ?? '13'}s</Text>
              </View>
              <View style={styles.metricPill}>
                <Wind size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>VIENTO</Text>
                <Text style={styles.metricPillValue}>{displayForecast?.[0]?.windSpeed ?? '--'}kts</Text>
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

        {!hasLiveForecast || !hourlyForecastByDay.length ? (
          <Text style={styles.emptyForecastText}>Sin datos de forecast disponibles.</Text>
        ) : (
          hourlyForecastByDay.map((day, dayIdx) => (
            <View key={`${day.date}-${dayIdx}`} style={styles.dayHourlyCard}>
              <View style={styles.dayHourlyHeader}>
                <Text style={styles.dayHourlyTitle}>{day.dayOfWeek || day.dayLabel}</Text>
                <Text style={styles.dayHourlySub}>{formatShortDate(day.date)}</Text>
              </View>
                <View style={styles.tableContainerNoScroll}>
                  <View style={styles.forecastTable}>
                    <View style={styles.tableHeaderRow}>
                      <View style={[styles.tableCell, styles.hourCell, styles.headerHourCell]} />
                      <View style={[styles.tableCell, styles.surfCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>SURF</Text>
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
                      const stars = getRowStars(hour.surfHeight ?? hour.swellHeight, kph);
                      const windAngle = Number.isFinite(Number(hour.windDirectionDeg))
                        ? Number(hour.windDirectionDeg)
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
                            <Text style={[styles.tableHourText, styles.verticalHourText]}>{formatHourSlot(hour.time)}</Text>
                          </View>

                          <View style={[styles.tableCell, styles.surfCell, styles.surfBandCell]}>
                            <Text style={[styles.metricValue, styles.surfMetricValue]}>
                              {hour.surfHeight ?? hour.swellHeight ?? '--'}<Text style={styles.surfUnitSmall}>m</Text>
                            </Text>
                          </View>

                          <View style={[styles.tableCell, styles.swellCell, styles.combinedCell, styles.swellBandCell, idx % 2 === 1 ? styles.swellBandCellAlt : null]}>
                            <Text style={styles.metricValue}>{hour.swellHeight ?? '--'}<Text style={styles.unitSmall}>m</Text></Text>
                            <Text style={styles.swellSecondary}>{hour.swellPeriod ?? '--'}<Text style={styles.unitSmall}>s</Text> {hour.swellDirection ?? '--'}</Text>
                            <Text style={styles.starLine}>{stars}</Text>
                          </View>

                          <View
                            style={[
                              styles.tableCell,
                              styles.windCell,
                              styles.windCombinedCell,
                              { backgroundColor: getWindColorBg(hour.windSpeed) },
                            ]}
                          >
                            <View style={styles.windMainInfo}>
                              <Text style={styles.windSpeedText}>{kph ?? '--'} <Text style={styles.windUnit}>kph</Text></Text>
                              <Text style={styles.windDirectionLine}>
                                {hour.windDirection ?? '--'} {Number.isFinite(Number(hour.windDirectionDeg)) ? `${hour.windDirectionDeg}°` : ''}
                              </Text>
                            </View>
                            <View style={[styles.windArrowPanel, idx % 2 === 0 ? styles.windArrowPanelEven : null]}>
                              <View style={{ transform: [{ rotate: `${windAngle}deg` }] }}>
                                <ArrowUp size={24} color="#FFFFFF" />
                              </View>
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

        {/* 16-Day Forecast Table */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>PRONÓSTICO 16 DÍAS</Text>
        
        {!hasLiveForecast ? (
          <Text style={styles.emptyForecastText}>No hay datos reales cargados todavía para este spot.</Text>
        ) : (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.tableContainer}
            contentContainerStyle={styles.tableContent}
          >
            <View style={styles.forecastTable}>
              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellDay]}>DÍA</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>ALTURA</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>SWELL</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>PERÍODO</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>DIR</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>VIENTO</Text>
              </View>
              
              {/* Data Rows */}
              {displayForecast.slice(0, 16).map((day, idx) => (
                <TouchableOpacity 
                  key={idx}
                  style={styles.tableDataRow}
                  onPress={() => openDayDetail(day)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.tableCell, styles.tableCellDay]}>
                    <Text style={styles.tableDayText}>{day.dayOfWeek.substring(0, 3)}</Text>
                    <Text style={styles.tableDateText}>{day.date.substring(5)}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.tableCellMetric]}>
                    <View 
                      style={[
                        styles.ratingPill,
                        { backgroundColor: SURFLINE_COLORS[day.rating] || SURFLINE_COLORS.FAIR }
                      ]}>
                      <Text style={styles.ratingPillText}>{day.rating}</Text>
                    </View>
                  </View>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {day.height.min}-{day.height.max}<Text style={styles.unitSmall}>m</Text>
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {day.primarySwell.height}<Text style={styles.unitSmall}>m</Text>
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {day.primarySwell.period}<Text style={styles.unitSmall}>s</Text>
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {day.windDirection}
                  </Text>
                  <View 
                    style={[
                      styles.tableCell, 
                      styles.tableCellMetric, 
                      styles.windSpeedCell,
                      { backgroundColor: getWindColorBg(day.windSpeed) }
                    ]}
                  >
                    <Text style={styles.windSpeedText}>{day.windSpeed}</Text>
                    <Text style={styles.unitSmall}>kts</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Modal de Detalles */}
      <DayDetailModal
        visible={modalVisible}
        day={selectedDay}
        spot={spot}
        onClose={() => setModalVisible(false)}
      />
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
  dayHourlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dayHourlyTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
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
    backgroundColor: '#EEF2F7',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2EC',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E0E7',
    paddingVertical: 0,
    minHeight: 74,
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
  },
  surfCell: {
    flex: 1.2,
  },
  swellCell: {
    flex: 1.75,
  },
  windCell: {
    flex: 2.1,
  },
  headerHourCell: {
    backgroundColor: '#E2E8F0',
  },
  headerMainCell: {
    backgroundColor: '#EEF2F7',
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
    fontWeight: '900',
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
  },
  windSpeedText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  windUnit: {
    color: '#E8F4FF',
    fontSize: 10,
    fontWeight: '700',
  },
  hourBandCell: {
    backgroundColor: '#F3F6FA',
  },
  hourBandCellAlt: {
    backgroundColor: '#EDF2F7',
  },
  surfBandCell: {
    backgroundColor: '#F1F5F9',
  },
  swellBandCell: {
    backgroundColor: '#F8FAFC',
  },
  swellBandCellAlt: {
    backgroundColor: '#F3F7FB',
  },
  combinedCell: {
    alignItems: 'flex-start',
    gap: 3,
  },
  swellSecondary: {
    color: '#3B4A59',
    fontSize: 11,
    fontWeight: '700',
  },
  starLine: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  windCombinedCell: {
    borderRadius: 0,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.08)',
  },
  windMainInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 2,
    borderRightWidth: 1,
    borderRightColor: 'rgba(15,23,42,0.10)',
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
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(15,23,42,0.10)',
  },
  windArrowPanelEven: {
    backgroundColor: 'rgba(15,23,42,0.02)',
  },
  windDirectionLine: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyForecastText: { color: '#64748B', fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },

  tableHourText: {
    color: '#495867',
    fontSize: 12,
    fontWeight: '800',
  },
  verticalHourText: {
    transform: [{ rotate: '90deg' }],
    width: 48,
    textAlign: 'center',
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
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