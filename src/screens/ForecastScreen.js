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

// Color para velocidad de viento
const getWindColorBg = (windSpeed) => {
  const speed = Number(windSpeed) || 0;
  if (speed < 15) return '#15803D'; // Verde bajo
  if (speed < 25) return '#EA8C00'; // Naranja moderado
  return '#DC2626'; // Rojo fuerte
};

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

        {/* Hourly Forecast Table for Today */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>HOY - PRONÓSTICO POR HORA</Text>
        
        {!hasLiveForecast || !displayForecast[0]?.hourlyData?.length ? (
          <Text style={styles.emptyForecastText}>No hay datos horarios disponibles para hoy.</Text>
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
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellDay]}>HORA</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>SWELL</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>PER</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>DIR</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>VIENTO</Text>
                <Text style={[styles.tableCell, styles.tableHeader, styles.tableCellMetric]}>AGUA</Text>
              </View>
              
              {/* Data Rows */}
              {displayForecast[0].hourlyData.map((hour, idx) => (
                <View 
                  key={idx}
                  style={styles.tableDataRow}
                >
                  <Text style={[styles.tableCell, styles.tableCellDay, styles.tableHourText]}>{hour.time}</Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {hour.swellHeight}<Text style={styles.unitSmall}>m</Text>
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {hour.swellPeriod}<Text style={styles.unitSmall}>s</Text>
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {hour.swellDirection}
                  </Text>
                  <View 
                    style={[
                      styles.tableCell, 
                      styles.tableCellMetric, 
                      styles.windSpeedCell,
                      { backgroundColor: getWindColorBg(hour.windSpeed) }
                    ]}
                  >
                    <Text style={styles.windSpeedText}>{hour.windSpeed}</Text>
                    <Text style={styles.unitSmall}>kts</Text>
                  </View>
                  <Text style={[styles.tableCell, styles.tableCellMetric, styles.metricValue]}>
                    {hour.waterTemp}<Text style={styles.unitSmall}>°C</Text>
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
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

  // Forecast Table (Horizontal)
  sectionTitle: {
    color: '#7EB3CB',
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
  tableContainer: {
    marginHorizontal: 12,
    marginBottom: 24,
  },
  tableContent: {
    paddingRight: 12,
  },
  forecastTable: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E4E63',
    backgroundColor: '#04111A',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0D2B3A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E4E63',
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#113142',
    paddingVertical: 0,
  },
  tableCell: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCellDay: {
    minWidth: 58,
  },
  tableCellMetric: {
    minWidth: 64,
  },
  tableHeader: {
    color: '#7EB3CB',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  tableDayText: {
    color: '#E5F6FF',
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
    color: '#D2EAF7',
    fontSize: 12,
    fontWeight: '700',
  },
  unitSmall: {
    color: '#8FB0C4',
    fontSize: 9,
    fontWeight: '600',
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
  emptyForecastText: { color: '#8EA2B8', fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },

  tableHourText: {
    color: '#E5F6FF',
    fontSize: 12,
    fontWeight: '800',
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