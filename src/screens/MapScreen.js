import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { LocateFixed, Minus, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpotMarker } from '../components/SpotMarker';
import { CompactReportsPreview } from '../components/CompactReportsPreview';
import { MAP_DARK_STYLE } from '../constants/MapStyle';
import { NZ_SPOTS } from '../constants/Spots';
import { fetchCommunityReports, fetchCommunityReportsExcludingViewed, markReportAsViewed, subscribeToCommunityReports } from '../services/communityService';
import { requestPushPermission } from '../services/notificationService';

const NEARBY_COMMENT_RADIUS_M = 20000;

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
  const lastNearbyReportIdRef = useRef(null);

  const [region, setRegion] = useState({
    latitude: -37.6402,
    longitude: 176.1845,
    latitudeDelta: 0.14,
    longitudeDelta: 0.14,
  });
  const [userCoords, setUserCoords] = useState(null);
  const [hasNearbyAlert, setHasNearbyAlert] = useState(false);
  const [nearbyCommentCount, setNearbyCommentCount] = useState(0);
  const [nearbyReports, setNearbyReports] = useState([]);
  const [activeReportsPreview, setActiveReportsPreview] = useState([]);
  const mapExpanded = true;
  const previewTopOffset = Math.max(insets.top + 72, 112);

  const profileDisplayName = authProfile?.display_name || 'Surfer';
  const profileInitial = profileDisplayName?.[0]?.toUpperCase() || 'S';

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

  const refreshNearbyCommentAlerts = async (coords = userCoords, skipPushNotification = false) => {
    if (!coords) return;

    const nextReports = await fetchCommunityReportsExcludingViewed();

    const filteredNearbyReports = (nextReports || []).filter((report) => {
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

    setNearbyCommentCount(filteredNearbyReports.length);
    setHasNearbyAlert(filteredNearbyReports.length > 0);
    setNearbyReports(filteredNearbyReports);

    if (skipPushNotification) return;

    const newestNearby = filteredNearbyReports[0];
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
  };

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

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [userCoords]);

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

  const handleZoom = (type) => {
    const factor = type === 'in' ? 0.5 : 2;
    const newRegion = {
      ...region,
      latitudeDelta: region.latitudeDelta * factor,
      longitudeDelta: region.longitudeDelta * factor,
    };

    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 450);
  };

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
      // Filtrar reportes de las últimas 3 horas
      const threeHoursAgo = 180; // minutos
      const reportsLast3Hours = nearbyReports.filter(
        (report) => Number(report.minutesAgo || 999) <= threeHoursAgo
      );

      if (reportsLast3Hours.length > 0) {
        setActiveReportsPreview(reportsLast3Hours);
        // Detener la animación cuando se abre el preview
        setHasNearbyAlert(false);
      }
    }
  };

  const handleReportPreviewPress = async (report) => {
    const selectedSpot = NZ_SPOTS.find(
      (spot) => spot.name.toLowerCase() === report.spotName.toLowerCase()
    );
    if (selectedSpot) {
      onSpotSelect(selectedSpot);
      setActiveReportsPreview([]);
      // Marcar el reporte como visto en la base de datos
      await markReportAsViewed(report.id);
      // Refrescar reportes cercanos para quitar la animación si no hay más pendientes
      setTimeout(() => {
        refreshNearbyCommentAlerts(userCoords, true);
      }, 300);
      onOpenForecast();
    }
  };

  const handleCloseReportsPreview = () => {
    setActiveReportsPreview([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
                    outputRange: [0, 0.55],
                  }),
                  transform: [
                    {
                      scale: profilePulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.28],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Text style={styles.profileInitialText}>{profileInitial}</Text>
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

        <View style={styles.controls}>
          <View style={styles.spotCountBadge}>
            <Text style={styles.spotCountText}>{visibleSpots.length} visibles</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => handleZoom('in')}>
            <Plus color="white" size={20} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => handleZoom('out')}>
            <Minus color="white" size={20} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={handleLocateMe}>
            <LocateFixed color="white" size={20} />
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
  container: { flex: 1, backgroundColor: '#02070B' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: 'rgba(4, 18, 28, 0.9)',
    borderWidth: 1,
    borderColor: '#1E4E63',
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E4E63',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
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
    fontSize: 20,
    fontWeight: '900',
    color: '#EAF8FF',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  subtext: {
    fontSize: 11,
    color: '#73AFC9',
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  profileInitialCircle: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D2838',
    borderWidth: 1,
    borderColor: '#2A6A86',
    position: 'relative',
    overflow: 'visible',
  },
  profilePulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#00D15D',
  },
  profileInitialText: {
    color: '#D8ECFF',
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
    backgroundColor: '#00D15D',
    borderWidth: 1,
    borderColor: '#06210F',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  profileNotificationDotText: {
    color: '#07110B',
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
    borderRadius: 24,
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
    borderRadius: 8,
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
    backgroundColor: 'rgba(4, 18, 28, 0.92)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1E4E63',
  },
  btn: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: '#0D2838',
    borderWidth: 1,
    borderColor: '#2A6A86',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotCountBadge: {
    backgroundColor: '#0A1F2C',
    borderWidth: 1,
    borderColor: '#255C76',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  spotCountText: {
    color: '#D9F3FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
