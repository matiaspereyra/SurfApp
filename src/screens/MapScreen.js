import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { Bell, LocateFixed, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpotMarker } from '../components/SpotMarker';
import { CompactReportsPreview } from '../components/CompactReportsPreview';
import { MAP_DARK_STYLE } from '../constants/MapStyle';
import { NZ_SPOTS } from '../constants/Spots';
import { UI_COLORS } from '../theme/ui';
import { fetchCommunityReports, fetchCommunityReportsExcludingViewed, markReportAsViewed, subscribeToCommunityReports } from '../services/communityService';
import { requestPushPermission } from '../services/notificationService';

const NEARBY_COMMENT_RADIUS_M = 20000;
const BOTTOM_NAV_RESERVED_SPACE = 56;

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

export default function MapScreen({
  onSpotSelect,
  selectedSpot,
  authUser = null,
  authProfile = null,
  onOpenCommunity = () => {},
  onOpenForecast = () => {},
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const markerPressedRef = useRef(false);
  const profilePulseAnim = useRef(new Animated.Value(0)).current;
  const bellAnim = useRef(new Animated.Value(0)).current;
  const lastNearbyReportIdRef = useRef(null);
  const lastNearbyCountRef = useRef(0);

  const [region, setRegion] = useState({
    latitude: -37.6402,
    longitude: 176.1845,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [userCoords, setUserCoords] = useState(null);
  const [hasNearbyAlert, setHasNearbyAlert] = useState(false);
  const [nearbyCommentCount, setNearbyCommentCount] = useState(0);
  const [nearbyReports, setNearbyReports] = useState([]);
  const [activeReportsPreview, setActiveReportsPreview] = useState([]);
  const mapExpanded = true;
  const previewTopOffset = Math.max(insets.top + 72, 112);
  const bottomNavOffset = BOTTOM_NAV_RESERVED_SPACE + insets.bottom;

  useEffect(() => {
    if (!selectedSpot || !mapRef.current) return;

    const focusRegion = {
      latitude: selectedSpot.lat,
      longitude: selectedSpot.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    setRegion(focusRegion);
    mapRef.current.animateToRegion(focusRegion, 800);
  }, [selectedSpot]);

  useEffect(() => {
    let mounted = true;

    const loadInitialContext = async () => {
      await requestPushPermission().catch(() => {});

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!mounted) return;

        setUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (_error) {
        // Keep map usable even when location is unavailable.
      }
    };

    loadInitialContext();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshNearbyCommentAlerts = useCallback(async (coords = userCoords, skipPushNotification = false) => {
    if (!coords) return [];

    const nextReports = await fetchCommunityReportsExcludingViewed();

    const filteredNearbyReports = (nextReports || []).filter((report) => {
      if (authUser?.id && report?.reporterId && String(report.reporterId) === String(authUser.id)) {
        return false;
      }

      const spot = NZ_SPOTS.find(
        (item) => item.name.toLowerCase() === String(report.spotName || '').toLowerCase()
      );

      if (!spot) return false;

      const distance = calcDistanceMeters(
        coords.latitude,
        coords.longitude,
        spot.lat,
        spot.lng
      );

      return distance <= NEARBY_COMMENT_RADIUS_M;
    });

    const nextCount = filteredNearbyReports.length;
    const newestNearby = filteredNearbyReports[0];

    if (nextCount > 0) {
      const countIncreased = nextCount > lastNearbyCountRef.current;
      const newestChanged = newestNearby?.id && newestNearby.id !== lastNearbyReportIdRef.current;

      if (countIncreased || newestChanged) {
        Animated.sequence([
          Animated.timing(bellAnim, {
            toValue: 1,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.spring(bellAnim, {
            toValue: 0,
            friction: 4,
            tension: 120,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }

    lastNearbyCountRef.current = nextCount;
    setNearbyCommentCount(nextCount);
    setHasNearbyAlert(filteredNearbyReports.length > 0);
    setNearbyReports(filteredNearbyReports);

    if (skipPushNotification) return filteredNearbyReports;

    if (!newestNearby) return;

    if (!lastNearbyReportIdRef.current) {
      lastNearbyReportIdRef.current = newestNearby.id;
      return;
    }

    if (
      newestNearby.id !== lastNearbyReportIdRef.current &&
      Number(newestNearby.minutesAgo || 999) <= 2 &&
      newestNearby.reporterId !== authUser?.id
    ) {
      lastNearbyReportIdRef.current = newestNearby.id;
    }

    return filteredNearbyReports;
  }, [authUser?.id, userCoords]);

  useEffect(() => {
    if (!userCoords) return;

    let mounted = true;

    const handleReportsUpdate = async () => {
      if (mounted) {
        await refreshNearbyCommentAlerts(userCoords);
      }
    };

    handleReportsUpdate();
    const unsubscribe = subscribeToCommunityReports(handleReportsUpdate);
    const pollId = setInterval(() => {
      if (mounted) {
        refreshNearbyCommentAlerts(userCoords, true).catch(() => {});
      }
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(pollId);
      unsubscribe();
    };
  }, [refreshNearbyCommentAlerts, userCoords]);

  useEffect(() => {
    let pulseLoop = null;

    if (hasNearbyAlert) {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(profilePulseAnim, {
            toValue: 1,
            duration: 760,
            useNativeDriver: true,
          }),
          Animated.timing(profilePulseAnim, {
            toValue: 0,
            duration: 760,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
    } else {
      profilePulseAnim.setValue(0);
    }

    return () => {
      pulseLoop?.stop();
    };
  }, [hasNearbyAlert, profilePulseAnim]);

  const visibleSpots = useMemo(() => {
    const latBuffer = region.latitudeDelta * 0.08;
    const lngBuffer = region.longitudeDelta * 0.08;
    const minLat = region.latitude - region.latitudeDelta / 2 - latBuffer;
    const maxLat = region.latitude + region.latitudeDelta / 2 + latBuffer;
    const minLng = region.longitude - region.longitudeDelta / 2 - lngBuffer;
    const maxLng = region.longitude + region.longitudeDelta / 2 + lngBuffer;

    return NZ_SPOTS.filter(
      (spot) => spot.lat >= minLat && spot.lat <= maxLat && spot.lng >= minLng && spot.lng <= maxLng
    );
  }, [region]);

  const spotsToRender =
    selectedSpot && !visibleSpots.some((spot) => spot.id === selectedSpot.id)
      ? [...visibleSpots, selectedSpot]
      : visibleSpots;

  const handleLocateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userRegion = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };

      setRegion(userRegion);
      setUserCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      mapRef.current?.animateToRegion(userRegion, 600);
    } catch (_error) {
      // Ignore GPS errors to keep map interaction responsive.
    }
  };

  const handleMapPress = () => {
    if (markerPressedRef.current) {
      markerPressedRef.current = false;
      return;
    }

    onSpotSelect(null);
  };

  const handleOpenCommunityFromProfile = () => {
    if (nearbyReports.length > 0) {
      const nextPreviewReports = [...nearbyReports].sort(
        (a, b) => Number(a.minutesAgo || 999) - Number(b.minutesAgo || 999)
      );

      setActiveReportsPreview(nextPreviewReports);
      setHasNearbyAlert(false);
    }
  };

  const handleReportPreviewPress = async (report) => {
    setActiveReportsPreview([]);
    // Marcar el reporte como visto en la base de datos
    await markReportAsViewed(report.id);
    // Refrescar reportes cercanos para quitar la animación si no hay más pendientes
    setTimeout(() => {
      refreshNearbyCommentAlerts(userCoords, true);
    }, 300);
    onOpenCommunity(report.spotName, report.id, report);
  };

  const handleCloseReportsPreview = () => {
    setActiveReportsPreview([]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.greeting} numberOfLines={1}>
              Surf Map
            </Text>
            <Text style={styles.subtext} numberOfLines={1}>
              Live Spots
            </Text>
          </View>

          <TouchableOpacity style={styles.profileInitialCircle} onPress={handleOpenCommunityFromProfile}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.profilePulse,
                {
                  opacity: profilePulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.16],
                  }),
                },
              ]}
            />
            <Animated.View
              style={{
                transform: [
                  {
                    scale: bellAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.18],
                    }),
                  },
                  {
                    rotate: bellAnim.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: ['0deg', '-12deg', '12deg', '-8deg', '0deg'],
                    }),
                  },
                ],
              }}
            >
              <Bell
                size={16}
                color={hasNearbyAlert ? '#0284C7' : UI_COLORS.textSecondary}
                strokeWidth={2.3}
              />
            </Animated.View>
            {nearbyCommentCount > 0 ? (
              <View style={styles.profileNotificationDot}>
                <Text style={styles.profileNotificationDotText}>
                  {nearbyCommentCount > 9 ? '9+' : nearbyCommentCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        style={[
          styles.expandedContainer,
          {
            paddingBottom: bottomNavOffset,
            opacity: 1,
            pointerEvents: 'auto',
          },
        ]}
      >
        <MapView
          ref={mapRef}
          style={styles.mapFull}
          initialRegion={region}
          customMapStyle={MAP_DARK_STYLE}
          showsUserLocation
          onPress={handleMapPress}
          onPanDrag={() => onSpotSelect(null)}
          onRegionChangeComplete={(nextRegion) => {
            setRegion(nextRegion);
          }}
        >
          {spotsToRender.map((spot) => (
            <SpotMarker
              key={spot.id}
              spot={spot}
              isSelected={selectedSpot?.id === spot.id}
              onPress={(nextSpot) => {
                markerPressedRef.current = true;
                onSpotSelect(nextSpot);
              }}
            />
          ))}
        </MapView>

        <View style={[styles.controls, { bottom: bottomNavOffset + 200 }]}>
          <TouchableOpacity style={styles.btn} onPress={() => {}}>
            <Search color="#8E9196" size={20} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={handleLocateMe}>
            <LocateFixed color="#8E9196" size={20} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {activeReportsPreview.length > 0 && (
        <View style={[styles.previewOverlay, { paddingTop: previewTopOffset }]}>
          <TouchableOpacity 
            style={styles.previewBackdrop}
            activeOpacity={1}
            onPress={handleCloseReportsPreview}
          />
          <View style={{ pointerEvents: 'auto', paddingTop: 20 }}>
            <CompactReportsPreview
              reports={activeReportsPreview}
              onReportPress={handleReportPreviewPress}
              onClose={handleCloseReportsPreview}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.appBg },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: UI_COLORS.panel,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '900',
    color: UI_COLORS.textPrimary,
    marginBottom: 0,
    letterSpacing: 0.3,
  },
  subtext: {
    fontSize: 10,
    color: UI_COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  profileInitialCircle: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.panelStrong,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorderSoft,
    position: 'relative',
    overflow: 'visible',
  },
  profilePulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#38BDF8',
    borderWidth: 0,
  },
  profileInitialText: {
    color: UI_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    zIndex: 2,
  },
  profileNotificationDot: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 4,
    paddingHorizontal: 4,
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  profileNotificationDotText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  collapsedContainer: {
    flex: 1,
    paddingTop: 150,
    paddingHorizontal: 20,
    paddingBottom: 24,
    position: 'relative',
  },
  mapSmall: {
    height: 220,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2F3A46',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  mapButtonOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  spotMapButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#000',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotMapButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  expandedContainer: {
    flex: 1,
  },
  mapFull: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    right: 14,
    bottom: 88,
    alignItems: 'center',
    gap: 7,
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeMapButton: {
    position: 'absolute',
    top: 62,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#101820',
    borderWidth: 1,
    borderColor: '#304355',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMapButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 0,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 99,
  },
});
