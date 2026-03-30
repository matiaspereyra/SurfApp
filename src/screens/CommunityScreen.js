import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { NZ_SPOTS } from '../constants/Spots';
import { formatRelativeMinutes } from '../lib/timeFormat';
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
  const insets = useSafeAreaInsets();
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <View style={styles.iconFrame}>
            <View style={[styles.iconStroke, styles.iconBackTop]} />
            <View style={[styles.iconStroke, styles.iconBackBottom]} />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community</Text>
        <TouchableOpacity style={styles.headerAction} onPress={() => setShowPublishModal(true)}>
          <View style={styles.iconFrame}>
            <View style={[styles.iconStroke, styles.iconPlusH]} />
            <View style={[styles.iconStroke, styles.iconPlusV]} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, styles.reportsCard]}>
          <Text style={styles.cardTitle}>Reportes por playa cercana</Text>
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
          <Text style={styles.cardTitle}>Top reputacion</Text>
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



      {showPublishModal && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowPublishModal(false)}
          />
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentInner}>
            <View style={styles.card}>
              <View style={styles.modalHeader}>
                <Text style={styles.cardTitle}>Publicar estado del spot</Text>
                <TouchableOpacity onPress={() => setShowPublishModal(false)}>
                  <View style={styles.closeIconFrame}>
                    <View style={[styles.iconStroke, styles.iconCloseA]} />
                    <View style={[styles.iconStroke, styles.iconCloseB]} />
                  </View>
                </TouchableOpacity>
              </View>
              <Text style={styles.cardHint}>Lista automatica de playas cercanas segun tu ubicacion actual.</Text>

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

              <TextInput
                value={newReportText}
                onChangeText={setNewReportText}
                style={styles.reportInput}
                placeholder="Describe condiciones reales del mar..."
                placeholderTextColor="#5E6C7A"
                multiline
              />

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

              <TouchableOpacity
                style={[styles.publishBtn, publishing ? styles.publishBtnDisabled : null]}
                onPress={handlePublish}
                disabled={publishing}
              >
                <Text style={styles.publishBtnText}>{publishing ? 'Publicando...' : 'Publicar reporte'}</Text>
              </TouchableOpacity>

              {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
            </View>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2634',
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111C28',
    borderWidth: 1,
    borderColor: '#274055',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerActionText: {
    color: '#D6E6F5',
    fontSize: 11,
    fontWeight: '700',
  },
  iconFrame: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconStroke: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#D6E6F5',
  },
  iconBackTop: {
    transform: [{ rotate: '-40deg' }, { translateX: -2 }, { translateY: -3 }],
  },
  iconBackBottom: {
    transform: [{ rotate: '40deg' }, { translateX: -2 }, { translateY: 3 }],
  },
  iconPlusH: {
    width: 12,
  },
  iconPlusV: {
    width: 2,
    height: 12,
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
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#111923',
    borderWidth: 1,
    borderColor: '#253548',
    borderRadius: 14,
    padding: 12,
    gap: 9,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cardHint: {
    color: '#8EA2B8',
    fontSize: 12,
  },
  spotPickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  spotPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2E3E4E',
    backgroundColor: '#0E1620',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  spotPillActive: {
    borderColor: '#00D15D',
    backgroundColor: '#0C2A1A',
  },
  spotPillText: {
    color: '#9BB1C7',
    fontSize: 11,
    fontWeight: '700',
  },
  spotPillTextActive: {
    color: '#B6F2CE',
  },
  gpsStatus: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  gpsStatusOn: {
    backgroundColor: '#00D15D',
    borderColor: '#00D15D',
  },
  gpsStatusOff: {
    backgroundColor: '#141E28',
    borderColor: '#304355',
  },
  gpsStatusText: {
    color: '#9FB3C8',
    fontSize: 11,
    fontWeight: '800',
  },
  gpsStatusTextOn: {
    color: '#07110B',
  },
  reportInput: {
    minHeight: 90,
    backgroundColor: '#0B1219',
    borderWidth: 1,
    borderColor: '#243444',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingTop: 10,
    color: '#FFFFFF',
    fontSize: 12,
    textAlignVertical: 'top',
  },
  ratingPickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#34485B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#121D29',
  },
  ratingPillActive: {
    borderColor: '#00D15D',
    backgroundColor: '#0D2C1B',
  },
  ratingPillText: {
    color: '#A9BED2',
    fontSize: 11,
    fontWeight: '800',
  },
  ratingPillTextActive: {
    color: '#C8F7DB',
  },
  publishBtn: {
    backgroundColor: '#00D15D',
    borderRadius: 9,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#001108',
    fontSize: 12,
    fontWeight: '800',
  },
  feedbackText: {
    color: '#A7D8BC',
    fontSize: 11,
  },
  reportCard: {
    backgroundColor: '#0D151F',
    borderWidth: 1,
    borderColor: '#223345',
    borderRadius: 11,
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
    backgroundColor: '#8FA5BB',
  },
  upvoteDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#00D15D',
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
    color: '#EAF5FF',
    fontSize: 13,
    fontWeight: '800',
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
    color: '#E9F3FC',
    fontSize: 13,
    fontWeight: '700',
  },
  reportMeta: {
    color: '#89A1B7',
    fontSize: 11,
    fontWeight: '600',
  },
  reportRating: {
    color: '#9CE1B7',
    fontSize: 11,
    fontWeight: '800',
  },
  reportText: {
    color: '#CFDEEC',
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
    backgroundColor: '#122636',
    borderWidth: 1,
    borderColor: '#2A495F',
    borderRadius: 999,
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
    color: '#E5F1FC',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  repPoints: {
    color: '#9FD8B4',
    fontSize: 12,
    fontWeight: '700',
  },

  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    paddingTop: 60,
    zIndex: 101,
    pointerEvents: 'box-none',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#0A1218',
    borderRadius: 12,
    maxHeight: '75%',
    marginHorizontal: 10,
    zIndex: 101,
    pointerEvents: 'auto',
  },
  modalContentInner: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  modalCloseBtn: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
});
