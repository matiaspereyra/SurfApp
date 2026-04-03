import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { Modal } from 'react-native';
import * as Location from 'expo-location';
import { NZ_SPOTS } from '../constants/Spots';
import { formatRelativeMinutes } from '../lib/timeFormat';
import { UI_COLORS, isCompactLayout } from '../theme/ui';
import AppHeader from '../components/AppHeader';
import {
  createCommunityReport,
  fetchCommunityReports,
  fetchCommunityReportsExcludingViewed,
  fetchTopReputation,
  markReportAsViewed,
  subscribeToCommunityReports,
  upvoteCommunityReport,
} from '../services/communityService';
import { requestPushPermission } from '../services/notificationService';

const NEARBY_RADIUS_METERS = 30000;
const USER_RATING_OPTIONS = ['POOR', 'FAIR', 'GOOD', 'EPIC'];

const toRad = (value) => (value * Math.PI) / 180;

const calcDistanceMeters = (aLat, aLng, bLat, bLng) => {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const ReportCardItem = React.memo(({ report, onPress, onUpvote, authUser }) => {
  return (
    <TouchableOpacity 
      key={report.id} 
      style={styles.reportCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.reportTopRow}>
        <View style={styles.reportSpotRow}>
          <View style={styles.iconSlot}>
            <View style={styles.pinDot} />
          </View>
          <Text style={styles.reportSpotName}>{report.spotName}</Text>
          <Text style={styles.reportMeta}>{formatRelativeMinutes(report.minutesAgo)}</Text>
        </View>
        <Text style={styles.reportRating}>{report.rating}</Text>
      </View>
      <Text style={styles.reportText}>{report.text}</Text>
      {!!report.forecastRating ? (
        <Text style={styles.reportForecastMeta}>
          Usuario: {report.userRating || report.rating} | Forecast: {report.forecastRating}
        </Text>
      ) : null}
      <View style={styles.reportBottomRow}>
        <Text style={styles.reportMeta}>{report.reporter} • {report.windKts}kts</Text>
        <View pointerEvents="auto">
          <TouchableOpacity
            style={[
              styles.upvoteBtn,
              authUser?.id && report?.reporterId && authUser.id === report.reporterId
                ? styles.upvoteBtnDisabled
                : null,
            ]}
            onPress={onUpvote}
            disabled={authUser?.id && report?.reporterId && authUser.id === report.reporterId}
          >
            <View style={styles.iconSlot}>
              <View style={styles.upvoteDot} />
            </View>
            <Text style={styles.upvoteText}>{report.score}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function CommunityScreen({ 
  authUser, 
  initialSpotName = '', 
  initialReportId = '',
  onInitialSpotConsumed = () => {}, 
  onBack,
  onOpenSpotForecast = () => {},
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = isCompactLayout(width);
  const [reports, setReports] = useState([]);
  const [reputationRows, setReputationRows] = useState([]);
  const [isReportsLoading, setIsReportsLoading] = useState(true);
  const [selectedSpotName, setSelectedSpotName] = useState('');
  const [selectedUserRating, setSelectedUserRating] = useState('FAIR');
  const [newReportText, setNewReportText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('loading');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const initialReportsLoadedRef = useRef(false);
  const hasAnimatedInRef = useRef(false);
  const contentFadeAnim = useRef(new Animated.Value(0)).current;

  const spotsWithDistance = useMemo(() => {
    if (!userCoords) return [];

    return NZ_SPOTS.map((spot) => {
      const distance = calcDistanceMeters(
        userCoords.latitude,
        userCoords.longitude,
        spot.lat,
        spot.lng
      );

      return {
        spot,
        distance: Math.round(distance),
      };
    }).sort((a, b) => a.distance - b.distance);
  }, [userCoords]);

  const nearbySpots = useMemo(() => {
    if (!spotsWithDistance.length) return [];

    return spotsWithDistance.filter((item) => item.distance <= NEARBY_RADIUS_METERS);
  }, [spotsWithDistance]);

  const selectedSpotDistance = useMemo(() => {
    const found = nearbySpots.find((item) => item.spot.name === selectedSpotName);
    return found?.distance ?? null;
  }, [nearbySpots, selectedSpotName]);

  const selectedSpot = useMemo(() => {
    if (!selectedSpotName) return nearbySpots[0]?.spot || null;
    const match = nearbySpots.find((item) => item.spot.name === selectedSpotName);
    return match?.spot || nearbySpots[0]?.spot || null;
  }, [nearbySpots, selectedSpotName]);

  const canReportFromHere =
    locationStatus === 'ready' && selectedSpotDistance !== null && selectedSpotDistance <= NEARBY_RADIUS_METERS;
  const isInitialLoading = isReportsLoading || locationStatus === 'loading';
  const contentTranslateY = contentFadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  const reportsByNearbySpot = useMemo(
    () =>
      nearbySpots.map((item) => ({
        spotName: item.spot.name,
        distance: item.distance,
        reports: reports.filter((report) => report.spotName === item.spot.name),
      })),
    [nearbySpots, reports]
  );

  const selectedForecast = selectedSpot?.forecast?.[0] || null;

  useEffect(() => {
    requestPushPermission().catch(() => {});
  }, []);

  useEffect(() => {
    if (isInitialLoading || hasAnimatedInRef.current) {
      return;
    }

    hasAnimatedInRef.current = true;
    Animated.timing(contentFadeAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [contentFadeAnim, isInitialLoading]);

  useEffect(() => {
    let mounted = true;

    const loadLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setLocationStatus('denied');
            setFeedback('Activa permisos de ubicacion para ver spots cercanos y publicar.');
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) return;

        setUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus('ready');
      } catch (_error) {
        if (mounted) {
          setLocationStatus('error');
          setFeedback('No se pudo obtener tu ubicacion.');
        }
      }
    };

    loadLocation();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [nextReports, nextRep] = await Promise.all([
          fetchCommunityReports(),
          fetchTopReputation(),
        ]);

        if (!mounted) return;

        setReports(nextReports || []);
        setReputationRows(nextRep || []);
      } finally {
        if (mounted && !initialReportsLoadedRef.current) {
          initialReportsLoadedRef.current = true;
          setIsReportsLoading(false);
        }
      }
    };

    load();

    const unsubscribe = subscribeToCommunityReports(load);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedSpotName && nearbySpots.length) {
      setSelectedSpotName(nearbySpots[0].spot.name);
      return;
    }

    if (selectedSpotName && !nearbySpots.some((item) => item.spot.name === selectedSpotName) && nearbySpots.length) {
      setSelectedSpotName(nearbySpots[0].spot.name);
    }
  }, [nearbySpots, selectedSpotName]);

  useEffect(() => {
    if (!initialSpotName || !nearbySpots.length) return;

    const match = nearbySpots.find(
      (item) => item.spot.name.toLowerCase() === String(initialSpotName).toLowerCase()
    );

    if (match) {
      setSelectedSpotName(match.spot.name);
      onInitialSpotConsumed();
    }
  }, [initialSpotName, nearbySpots]);





  const handlePublish = async () => {
    setFeedback('');

    if (!authUser?.id) {
      setFeedback('Debes iniciar sesion para publicar un reporte.');
      return;
    }

    if (!canReportFromHere) {
      setFeedback('Solo puedes reportar si estas cerca del spot seleccionado.');
      return;
    }

    if (!selectedSpot?.name) {
      setFeedback('No hay playa cercana seleccionada para publicar.');
      return;
    }

    const comment = newReportText.trim();
    if (comment.length < 8) {
      setFeedback('Escribe al menos 8 caracteres.');
      return;
    }

    setPublishing(true);
    const result = await createCommunityReport({
      spotName: selectedSpot?.name,
      comment,
      windKts: Math.round(selectedForecast?.windSpeed || 8),
      userRating: selectedUserRating,
      forecastRating: selectedForecast?.rating || null,
      forecastSnapshot: selectedForecast
        ? {
            date: selectedForecast.date,
            rating: selectedForecast.rating,
            windKts: selectedForecast.windSpeed,
            windDirection: selectedForecast.windDirection,
            waterTemp: selectedForecast.waterTemp,
            primarySwell: selectedForecast.primarySwell,
            secondarySwell: selectedForecast.secondarySwell,
            tideInfo: selectedForecast.tideInfo,
          }
        : null,
    });
    setPublishing(false);

    if (!result.ok) {
      setFeedback(result.error || 'No se pudo publicar el reporte.');
      return;
    }

    setNewReportText('');
    setFeedback('Reporte publicado correctamente.');
  };

  const handleOpenFromNotification = async () => {
    setShowPublishModal(true);
  };

  const handleUpvote = useCallback(async (report) => {
    if (authUser?.id && report?.reporterId && authUser.id === report.reporterId) {
      setFeedback('No puedes dar like a tu propio reporte.');
      return;
    }

    const reportId = report?.id;
    const result = await upvoteCommunityReport(reportId);

    if (!result.ok) {
      setFeedback(result.error?.message || 'No se pudo registrar tu like.');
      return;
    }

    if (!result.applied) {
      setFeedback('Ya diste like a este reporte.');
      return;
    }

    setReports((prev) =>
      prev.map((report) =>
        report.id === reportId ? { ...report, score: report.score + 1 } : report
      )
    );
  }, [authUser?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        title="Community"
        compact
        onBack={onBack}
        rightElement={(
          <TouchableOpacity style={styles.headerAction} onPress={() => setShowPublishModal(true)}>
            <Plus size={18} color={UI_COLORS.textPrimary} strokeWidth={2} />
          </TouchableOpacity>
        )}
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, compact ? styles.scrollContentCompact : null]}>
        <View style={[styles.card, styles.reportsCard]}>
          <Text style={[styles.cardTitle, compact ? styles.cardTitleCompact : null]}>Reportes por playa cercana</Text>
          {isInitialLoading ? (
            <View style={styles.loadingWrap}>
              <View style={styles.loadingLineLong} />
              <View style={styles.loadingLineMedium} />
              <View style={styles.loadingBlock} />
              <View style={styles.loadingBlock} />
            </View>
          ) : null}

          {!isInitialLoading ? (
            <Animated.View
              style={{
                opacity: contentFadeAnim,
                transform: [{ translateY: contentTranslateY }],
              }}
            >
              {!reportsByNearbySpot.length ? (
                <Text style={styles.cardHint}>No hay playas cercanas para mostrar.</Text>
              ) : null}

              {reportsByNearbySpot.map((group) => (
                <View key={group.spotName} style={styles.reportGroupWrap}>
                  <View style={styles.reportGroupHeader}>
                    <Text style={styles.reportGroupTitle}>{group.spotName}</Text>
                    <Text style={styles.reportGroupMeta}>{(group.distance / 1000).toFixed(1)} km</Text>
                  </View>

                  {group.reports.length ? (
                    group.reports.map((report) => (
                      <ReportCardItem
                        key={report.id}
                        report={report}
                        authUser={authUser}
                        onPress={() => {
                          markReportAsViewed(report.id);
                          onOpenSpotForecast(report.spotName);
                        }}
                        onUpvote={() => handleUpvote(report)}
                      />
                    ))
                  ) : (
                    <Text style={styles.cardHint}>Todavia no hay reportes en esta playa.</Text>
                  )}
                </View>
              ))}
            </Animated.View>
          ) : null}
        </View>

        <View style={[styles.card, styles.reputationCard]}>
          <Text style={[styles.cardTitle, compact ? styles.cardTitleCompact : null]}>Top reputacion</Text>
          {isInitialLoading ? (
            <View style={styles.repSkeletonWrap}>
              <View style={styles.repSkeletonRow} />
              <View style={styles.repSkeletonRow} />
              <View style={styles.repSkeletonRow} />
              <View style={styles.repSkeletonRow} />
              <View style={styles.repSkeletonRow} />
            </View>
          ) : (
            <Animated.View
              style={{
                opacity: contentFadeAnim,
                transform: [{ translateY: contentTranslateY }],
              }}
            >
              {(reputationRows || []).slice(0, 5).map((row, idx) => (
                <View key={`${row.display_name}-${idx}`} style={styles.repRow}>
                  <Text style={styles.repRank}>#{idx + 1}</Text>
                  <Text style={styles.repName}>{row.display_name}</Text>
                  <Text style={styles.repPoints}>{row.trust_points} pts</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </View>
      </ScrollView>



      <Modal
        visible={showPublishModal}
        transparent={false}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowPublishModal(false)}
      >
        <View style={[styles.publishModalContainer, { paddingTop: insets.top / 2 }]}>
          <AppHeader
            title="Publicar estado del spot"
            subtitle="Comparte una lectura real del mar"
            compact
            skipSafeAreaOffset={true}
            leftElement={(
              <TouchableOpacity
                style={styles.headerAction}
                onPress={() => setShowPublishModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={UI_COLORS.textPrimary} size={22} />
              </TouchableOpacity>
            )}
          />

          <ScrollView
            style={styles.publishModalScroll}
            contentContainerStyle={[styles.publishModalContent, { paddingBottom: 120 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.publishIntroCard}>
              <Text style={styles.publishIntroTitle}>Reporte en vivo</Text>
              <Text style={styles.cardHint}>Lista automatica de playas cercanas segun tu ubicacion actual.</Text>
              <View style={styles.publishStatusRow}>
                <View style={[styles.gpsStatus, canReportFromHere ? styles.gpsStatusOn : styles.gpsStatusOff]}>
                  <Text style={[styles.gpsStatusText, canReportFromHere ? styles.gpsStatusTextOn : null]}>
                    {locationStatus !== 'ready'
                      ? 'Ubicacion pendiente'
                      : canReportFromHere
                        ? `Puedes reportar en ${selectedSpotName} (${(selectedSpotDistance / 1000).toFixed(1)} km)`
                        : nearbySpots.length
                          ? `Muy lejos para reportar (${selectedSpotDistance ? (selectedSpotDistance / 1000).toFixed(1) : '--'} km)`
                          : 'No hay playas cercanas dentro del radio permitido'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.publishSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Playa</Text>
                <Text style={styles.sectionHelper}>elige el spot más cercano</Text>
              </View>
              <View style={styles.spotPickerWrap}>
                {nearbySpots.map((item) => {
                  const selected = item.spot.name === selectedSpotName;
                  return (
                    <TouchableOpacity
                      key={item.spot.id}
                      style={[styles.spotPill, selected ? styles.spotPillActive : null]}
                      onPress={() => setSelectedSpotName(item.spot.name)}
                    >
                      <Text style={[styles.spotPillText, selected ? styles.spotPillTextActive : null]}>
                        {item.spot.name} ({(item.distance / 1000).toFixed(1)} km)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!nearbySpots.length ? (
                <Text style={styles.feedbackText}>No hay spots cercanos disponibles para tu ubicacion.</Text>
              ) : null}
            </View>

            <View style={styles.publishSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Comentario</Text>
                <Text style={styles.sectionHelper}>cuenta cómo está realmente</Text>
              </View>
              <TextInput
                value={newReportText}
                onChangeText={setNewReportText}
                style={styles.reportInput}
                placeholder="Describe condiciones reales del mar..."
                placeholderTextColor="#5E6C7A"
                multiline
              />
            </View>

            <View style={styles.publishSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Rating</Text>
                <Text style={styles.sectionHelper}>elige la calidad general</Text>
              </View>
              <View style={styles.ratingPickerWrap}>
                {USER_RATING_OPTIONS.map((value) => {
                  const active = value === selectedUserRating;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setSelectedUserRating(value)}
                      style={[styles.ratingPill, active ? styles.ratingPillActive : null]}
                    >
                      <Text style={[styles.ratingPillText, active ? styles.ratingPillTextActive : null]}>{value}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          </ScrollView>

          <View style={[styles.publishModalFooter, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <TouchableOpacity
              style={[styles.publishBtn, styles.publishBtnFullWidth, publishing ? styles.publishBtnDisabled : null]}
              onPress={handlePublish}
              disabled={publishing}
            >
              <Text style={styles.publishBtnText}>{publishing ? 'Publicando...' : 'Publicar reporte'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.panel,
  },
  headerAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsCard: {
    minHeight: 240,
  },
  reputationCard: {
    minHeight: 190,
  },
  loadingWrap: {
    gap: 8,
    paddingTop: 2,
  },
  loadingLineLong: {
    width: '72%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1A2734',
  },
  loadingLineMedium: {
    width: '46%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1A2734',
  },
  loadingBlock: {
    width: '100%',
    height: 64,
    borderRadius: 10,
    backgroundColor: '#12202D',
  },
  repSkeletonWrap: {
    gap: 10,
    paddingTop: 2,
  },
  repSkeletonRow: {
    width: '100%',
    height: 18,
    borderRadius: 8,
    backgroundColor: '#12202D',
  },
  closeIconFrame: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCloseA: {
    width: 12,
    transform: [{ rotate: '45deg' }],
  },
  iconCloseB: {
    width: 12,
    transform: [{ rotate: '-45deg' }],
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 36,
  },
  scrollContentCompact: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 10,
  },
  card: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    padding: 12,
    gap: 9,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 7,
  },
  cardTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardTitleCompact: {
    fontSize: 14,
  },
  cardHint: {
    color: UI_COLORS.textMuted,
    fontSize: 11,
  },
  spotPickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  spotPill: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    backgroundColor: UI_COLORS.panelStrong,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  spotPillActive: {
    borderColor: UI_COLORS.accent,
    backgroundColor: '#E5E7EB',
  },
  spotPillText: {
    color: UI_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  spotPillTextActive: {
    color: UI_COLORS.textPrimary,
  },
  gpsStatus: {
    borderRadius: 3,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  gpsStatusOn: {
    backgroundColor: UI_COLORS.accent,
    borderColor: UI_COLORS.accent,
  },
  gpsStatusOff: {
    backgroundColor: UI_COLORS.panelStrong,
    borderColor: UI_COLORS.panelBorder,
  },
  gpsStatusText: {
    color: UI_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  gpsStatusTextOn: {
    color: UI_COLORS.accentText,
  },
  reportInput: {
    minHeight: 90,
    backgroundColor: UI_COLORS.panelStrong,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingTop: 10,
    color: UI_COLORS.textPrimary,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  ratingPickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingPill: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: UI_COLORS.panelStrong,
  },
  ratingPillActive: {
    borderColor: UI_COLORS.accent,
    backgroundColor: '#E5E7EB',
  },
  ratingPillText: {
    color: UI_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  ratingPillTextActive: {
    color: UI_COLORS.textPrimary,
  },
  publishBtn: {
    backgroundColor: UI_COLORS.accent,
    borderRadius: 4,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: UI_COLORS.accentText,
    fontSize: 12,
    fontWeight: '800',
  },
  feedbackText: {
    color: '#A7D8BC',
    fontSize: 11,
  },
  reportCard: {
    backgroundColor: UI_COLORS.panelStrong,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    padding: 10,
    gap: 8,
  },
  iconSlot: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: UI_COLORS.textMuted,
  },
  upvoteDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: UI_COLORS.accent,
  },
  reportGroupWrap: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  reportGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportGroupTitle: {
    color: '#E5F6FF',
    fontSize: 13,
    fontWeight: '900',
  },
  reportGroupMeta: {
    color: '#8EA2B8',
    fontSize: 11,
    fontWeight: '700',
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportSpotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportSpotName: {
    color: '#F0F8FF',
    fontSize: 13,
    fontWeight: '700',
  },
  reportMeta: {
    color: '#7EA0B6',
    fontSize: 11,
    fontWeight: '700',
  },
  reportRating: {
    color: '#9CE1B7',
    fontSize: 11,
    fontWeight: '800',
  },
  reportText: {
    color: '#D2EAF7',
    fontSize: 12,
    lineHeight: 17,
  },
  reportForecastMeta: {
    color: '#88A0B7',
    fontSize: 11,
    fontWeight: '700',
  },
  reportBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upvoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  upvoteBtnDisabled: {
    opacity: 0.45,
  },
  upvoteText: {
    color: '#9FD8B4',
    fontSize: 11,
    fontWeight: '800',
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  repRank: {
    color: '#8EA2B8',
    width: 30,
    fontSize: 12,
    fontWeight: '700',
  },
  repName: {
    color: '#EFF8FF',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  repPoints: {
    color: '#9FD8B4',
    fontSize: 12,
    fontWeight: '700',
  },

  publishModalContainer: {
    flex: 1,
    backgroundColor: UI_COLORS.panel,
  },
  publishModalScroll: {
    flex: 1,
  },
  publishModalContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 14,
  },
  publishIntroCard: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 6,
    padding: 14,
    gap: 8,
  },
  publishIntroTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  publishStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  publishSection: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 6,
    padding: 12,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  sectionLabel: {
    color: UI_COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHelper: {
    color: UI_COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '700',
  },
  publishModalFooter: {
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.panelBorder,
    backgroundColor: UI_COLORS.appBg,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  publishBtnFullWidth: {
    width: '100%',
  },
});
