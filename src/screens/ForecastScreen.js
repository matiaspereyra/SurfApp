import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Dimensions,
  Animated, Modal, PanResponder, useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Wind, Waves, Thermometer, Clock, X, ArrowUp, Heart, Bell } from 'lucide-react-native';
import { SURFLINE_COLORS, getSpotShowName } from '../constants/Spots';
import { fetchSpotForecastByName } from '../services/forecastService';
import { getAlertRule, upsertAlertRule } from '../services/alertRuleService';
import { isCompactLayout } from '../theme/ui';

const { width, height } = Dimensions.get('window');

// Función para convertir dirección a ángulo (invierte para mostrar hacia dónde va, no de dónde viene)
const getDirectionAngle = (direction) => {
  const directions = {
    'N': 180,    // viene del norte, flecha apunta al sur
    'NE': 225,   // viene del noreste, flecha apunta al suroeste
    'E': 270,    // viene del este, flecha apunta al oeste
    'SE': 315,   // viene del sureste, flecha apunta al noroeste
    'S': 0,      // viene del sur, flecha apunta al norte
    'SW': 45,    // viene del suroeste, flecha apunta al noreste
    'W': 90,     // viene del oeste, flecha apunta al este
    'NW': 135,   // viene del noroeste, flecha apunta al sureste
  };
  return directions[direction] || 0;
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
  const hasLiveForecast = Boolean(displaySpot && displayForecast.length);

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
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft color="white" size={28} />
        </TouchableOpacity>
          <Text style={[styles.headerTitle, compact ? styles.headerTitleCompact : null]}>{getSpotShowName(spot)}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleToggleSpotAlert}
            style={styles.actionButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Bell
              color={isSpotAlertOn ? '#FFB100' : savingSpotAlert ? '#627486' : '#8EA2B8'}
              size={22}
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
              size={22}
              fill={isFavorite ? '#00D15D' : 'transparent'}
            />
          </TouchableOpacity>
        </View>
      </View>

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
            <Text style={[styles.height, compact ? styles.heightCompact : null]}>{displaySpot?.height || '--'}</Text>
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

        {/* 16-Day Forecast - 3 Days per Row */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>PRONÓSTICO 16 DÍAS</Text>
        <View style={styles.forecastGrid}>
          {displayForecast.slice(0, 12).map((day, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.dayCardLarge,
                { borderColor: SURFLINE_COLORS[day.rating] || SURFLINE_COLORS.FAIR },
              ]}
              onPress={() => openDayDetail(day)}
            >
              <View style={styles.dayHeadRow}>
                <View>
                  <Text style={styles.dayDayOfWeekLarge}>{day.dayOfWeek}</Text>
                  <Text style={styles.dayDateLarge}>{day.date.substring(5)}</Text>
                </View>
                <View
                  style={[
                    styles.ratingBadgeLarge2,
                    { backgroundColor: SURFLINE_COLORS[day.rating] || SURFLINE_COLORS.FAIR },
                  ]}
                >
                  <Text style={styles.ratingBadgeLargeText2}>{day.rating}</Text>
                </View>
              </View>

              <Text style={styles.dayHeightLarge}>{day.height.min}-{day.height.max}m</Text>

              <View style={styles.dataRowLine}>
                <Text style={styles.dataKey}>SWELL</Text>
                <Text style={styles.dataValue}>{day.primarySwell.height}m @ {day.primarySwell.period}s</Text>
              </View>

              <View style={styles.dataRowLine}>
                <Text style={styles.dataKey}>VIENTO</Text>
                <Text style={styles.dataValue}>{day.windSpeed}kts {day.windDirection}</Text>
              </View>

              <View style={styles.dataRowLine}>
                <Text style={styles.dataKey}>AGUA</Text>
                <View style={styles.inlineMetric}>
                  <Thermometer size={12} color="#46D7FF" />
                  <Text style={styles.dataValue}>{day.waterTemp}°C</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {!hasLiveForecast ? <Text style={styles.emptyForecastText}>No hay datos reales cargados todavía para este spot.</Text> : null}
        </View>

        {/* Simple Summary Section */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>HOY</Text>
        <View style={styles.todaySummary}>
          <View style={styles.todayRow}>
            <View style={styles.todayItem}>
              <Text style={styles.todayLabel}>ALTURA</Text>
              <Text style={styles.todayValue}>{displayForecast?.[0]?.height?.min ?? '--'}-{displayForecast?.[0]?.height?.max ?? '--'}m</Text>
            </View>
            <View style={styles.todayItem}>
              <Text style={styles.todayLabel}>VIENTO</Text>
              <Text style={styles.todayValue}>{displayForecast?.[0]?.windSpeed ?? '--'}kts</Text>
            </View>
            <View style={styles.todayItem}>
              <Text style={styles.todayLabel}>AGUA</Text>
              <Text style={styles.todayValue}>{displayForecast?.[0]?.waterTemp ?? '--'}°C</Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* Modal de Detalles */}
      <DayDetailModal
        visible={modalVisible}
        day={selectedDay}
        spot={spot}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container
  container: { flex: 1, backgroundColor: '#02070B' },
  atmosphereOne: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#0D3147',
    opacity: 0.28,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -180,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#0A2436',
    opacity: 0.38,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E4E63',
    alignItems: 'center',
    backgroundColor: 'rgba(4, 18, 28, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E4E63',
  },
  headerTitle: { color: '#EAF8FF', fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  headerTitleCompact: { fontSize: 16 },
  backButton: { padding: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionButton: { padding: 6, minWidth: 28, alignItems: 'center' },
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
    backgroundColor: '#061723',
    borderWidth: 1,
    borderColor: '#1E4E63',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 8,
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
    color: '#8CF1B9',
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#2A7652',
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#123425',
    letterSpacing: 0.8,
  },
  height: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  heightCompact: {
    fontSize: 56,
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
    backgroundColor: '#04111A',
    borderWidth: 1,
    borderColor: '#18445A',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },
  metricPillLabel: {
    color: '#5F8DA5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metricPillValue: {
    color: '#DBF4FF',
    fontSize: 13,
    fontWeight: '800',
  },
  liveHint: { color: '#9DB8CA', fontSize: 12, marginTop: 10 },

  // Forecast Grid (3 columns)
  sectionTitle: {
    color: '#7EB3CB',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 15,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitleCompact: {
    marginTop: 18,
    marginBottom: 12,
    fontSize: 10,
  },
  forecastGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 20,
  },
  dayCardLarge: {
    flex: 1,
    minWidth: '30%',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#06131D',
    justifyContent: 'flex-start',
    aspectRatio: 0.9,
  },
  dayHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  dayDayOfWeekLarge: { color: 'white', fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  dayDateLarge: { color: '#7B92A3', fontSize: 10 },
  ratingBadgeLarge2: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 2,
    alignSelf: 'flex-start',
  },
  ratingBadgeLargeText2: {
    color: '#000',
    fontWeight: '900',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  dayHeightLarge: { color: 'white', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  dataRowLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#113142',
    paddingTop: 6,
    marginTop: 6,
  },
  dataKey: {
    color: '#6E8CA0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dataValue: {
    color: '#CFE9F6',
    fontSize: 11,
    fontWeight: '700',
  },
  inlineMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyForecastText: { color: '#8EA2B8', fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },

  // Today Summary
  todaySummary: {
    paddingHorizontal: 14,
    marginBottom: 30,
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#061723',
    borderWidth: 1,
    borderColor: '#1E4E63',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  todayItem: {
    alignItems: 'center',
    flex: 1,
  },
  todayLabel: {
    color: '#6E8CA0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  todayValue: {
    color: '#E7F7FF',
    fontSize: 17,
    fontWeight: '900',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#050B12',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F26',
  },
  closeButton: {
    padding: 6,
  },
  modalTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  modalContent: { paddingHorizontal: 20, paddingVertical: 20 },

  // Info Cards
  infoCard: {
    backgroundColor: '#161B22',
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
  infoValue: { color: 'white', fontSize: 20, fontWeight: 'bold' },
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
    backgroundColor: '#0A0F16',
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
    borderColor: 'white',
  },
  tideInfoBox: {
    backgroundColor: '#0A0F16',
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