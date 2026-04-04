import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, Easing, PanResponder, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Plus, ThumbsUp } from 'lucide-react-native';
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
const MODAL_TOP_EPSILON = 40;
const USER_RATING_OPTIONS = ['POOR', 'FAIR', 'GOOD', 'EPIC'];
const RATING_TONE_MAP = {
  EPIC: '#0F766E',
  GOOD: '#166534',
  FAIR: '#B45309',
  POOR: '#B91C1C',
};

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

const getRatingTone = (rating) => {
  const key = String(rating || '').trim().toUpperCase();
  return RATING_TONE_MAP[key] || '#334155';
};

const ReportCardItem = React.memo(({ report, onPress, onUpvote, authUser, onLayout, highlighted, highlightProgress }) => {
  return (
    <TouchableOpacity 
      key={report.id} 
      style={[styles.reportCard, highlighted ? styles.reportCardHighlighted : null]}
      onPress={onPress}
      onLayout={onLayout}
      activeOpacity={0.7}
    >
      {highlighted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.reportHighlightOverlay,
            {
              opacity: highlightProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.3],
              }),
            },
          ]}
        />
      ) : null}

      <View style={styles.reportTopRow}>
        <View style={styles.reportSpotRow}>
          <View style={styles.iconSlot}>
            <View style={styles.pinDot} />
          </View>
          <Text style={styles.reportSpotName}>{report.spotName}</Text>
          {highlighted ? <Text style={styles.newBadge}>Nuevo</Text> : null}
        </View>
        <Text style={styles.reportMeta}>{formatRelativeMinutes(report.minutesAgo)}</Text>
      </View>

      <View style={styles.reportInfoRow}>
        <Text style={styles.reportSummary}>
          {String(report.reporter || 'Usuario')} califico el spot como{' '}
          <Text style={[styles.reportSummaryRating, { color: getRatingTone(report.rating) }]}>
            {String(report.rating || 'sin dato').toLowerCase()}
          </Text>
          {report.forecastRating ? (
            <>
              {' '}y el forecast dice que es{' '}
              <Text style={[styles.reportSummaryRating, { color: getRatingTone(report.forecastRating) }]}>
                {String(report.forecastRating).toLowerCase()}
              </Text>
              .
            </>
          ) : (
            '.'
          )}
        </Text>
      </View>

      <Text style={styles.reportCommentLabel}>Comentario del dia del usuario es:</Text>
      <View style={styles.reportCommentBox}>
        <Text style={styles.reportText}>{report.text}</Text>
      </View>
      <View style={styles.reportBottomRow}>
        <Text style={styles.reportWind}>{report.windKts}kts</Text>
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
              <ThumbsUp size={12} color={UI_COLORS.accent} strokeWidth={2.2} />
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
  initialReport = null,
  onInitialSpotConsumed = () => {}, 
  onBack,
  onOpenSpotForecast = () => {},
}) {
  const { width } = useWindowDimensions();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = isCompactLayout(width);
  const [reports, setReports] = useState(() => (initialReport ? [initialReport] : []));
  const [reputationRows, setReputationRows] = useState([]);
  const [isReportsLoading, setIsReportsLoading] = useState(true);
  const [selectedSpotName, setSelectedSpotName] = useState('');
  const [selectedUserRating, setSelectedUserRating] = useState('FAIR');
  const [newReportText, setNewReportText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [publishErrors, setPublishErrors] = useState({
    spot: '',
    comment: '',
    general: '',
  });
  const [publishing, setPublishing] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('loading');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const initialReportsLoadedRef = useRef(false);
  const hasAnimatedInRef = useRef(false);
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const reportLayoutRef = useRef({});
  const groupLayoutRef = useRef({});
  const didAutoFocusReportRef = useRef(false);
  const [reportLayoutTick, setReportLayoutTick] = useState(0);
  const [incomingReportId] = useState(initialReportId || '');
  const [incomingReport] = useState(initialReport || null);
  const [highlightedReportId, setHighlightedReportId] = useState(initialReportId || '');
  const highlightProgress = useRef(new Animated.Value(0)).current;
  const focusedSkeletonPulse = useRef(new Animated.Value(0.78)).current;
  const modalDragOffset = useRef(new Animated.Value(0)).current;
  const modalScrollOffsetRef = useRef(0);
  const publishModalScrollRef = useRef(null);
  const publishSectionOffsetsRef = useRef({
    intro: 0,
    spot: 0,
    comment: 0,
    general: 0,
  });
  const isHandleDraggingRef = useRef(false);
  const modalClosingRef = useRef(false);
  const modalDragValueRef = useRef(0);

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
  const hasImmediateReport = Boolean(initialReport);
  const showLoadingSkeleton = isInitialLoading && !hasImmediateReport;
  const showFocusedSkeleton = isInitialLoading && Boolean(incomingReportId);
  const contentTranslateY = contentFadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 0],
  });

  const reportsWithInitial = useMemo(() => {
    if (!incomingReport) return reports;

    const exists = reports.some((report) => String(report.id) === String(incomingReport.id));
    return exists ? reports : [incomingReport, ...reports];
  }, [incomingReport, reports]);

  const reportsByNearbySpot = useMemo(
    () =>
      nearbySpots.map((item) => ({
        spotName: item.spot.name,
        distance: item.distance,
        reports: reportsWithInitial.filter((report) => report.spotName === item.spot.name),
      }))
      .filter((group) => group.reports.length > 0),
    [nearbySpots, reportsWithInitial]
  );

  const selectedForecast = selectedSpot?.forecast?.[0] || null;
  const modalTopGap = insets.top + 28;
  const modalHalfCloseThreshold = (screenHeight - modalTopGap) * 0.5;

  const applyModalDragOffset = useCallback(
    (rawDy) => {
      const dy = Math.max(0, rawDy);
      modalDragOffset.setValue(dy);
    },
    [modalDragOffset]
  );

  const resetPublishModalPosition = useCallback(() => {
    Animated.spring(modalDragOffset, {
      toValue: 0,
      damping: 18,
      mass: 0.8,
      stiffness: 320,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [modalDragOffset]);

  const closePublishModalWithSlide = useCallback((velocity = 0) => {
    if (modalClosingRef.current) return;

    modalClosingRef.current = true;
    const duration = Math.max(150, Math.min(220, 200 - Math.abs(velocity) * 30));
    Animated.timing(modalDragOffset, {
      toValue: screenHeight,
      duration,
      useNativeDriver: true,
    }).start(() => {
      setShowPublishModal(false);
      modalDragOffset.setValue(0);
      modalScrollOffsetRef.current = 0;
      isHandleDraggingRef.current = false;
      modalClosingRef.current = false;
    });
  }, [modalDragOffset, screenHeight]);

  const settleModalFromGesture = useCallback(
    (gestureState) => {
      if (modalClosingRef.current) return;

      const draggedDistance = Math.max(gestureState.dy || 0, modalDragValueRef.current);

      if (draggedDistance > modalHalfCloseThreshold) {
        closePublishModalWithSlide(gestureState.vy || 0);
      } else {
        resetPublishModalPosition();
      }
    },
    [closePublishModalWithSlide, modalHalfCloseThreshold, resetPublishModalPosition]
  );

  const modalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => showPublishModal,
        onStartShouldSetPanResponderCapture: () => showPublishModal,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return (
            showPublishModal &&
            gestureState.dy > 1 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
          return (
            showPublishModal &&
            gestureState.dy > 1 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderGrant: () => {
          isHandleDraggingRef.current = true;
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (gestureState.dy <= 0) return;
          applyModalDragOffset(gestureState.dy);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          settleModalFromGesture(gestureState);

          isHandleDraggingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isHandleDraggingRef.current = false;
          resetPublishModalPosition();
        },
      }),
    [applyModalDragOffset, resetPublishModalPosition, settleModalFromGesture, showPublishModal]
  );

  const modalContentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return (
            showPublishModal &&
            !modalClosingRef.current &&
            !isHandleDraggingRef.current &&
            modalScrollOffsetRef.current <= MODAL_TOP_EPSILON &&
            gestureState.dy > 0.1 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
          return (
            showPublishModal &&
            !modalClosingRef.current &&
            !isHandleDraggingRef.current &&
            modalScrollOffsetRef.current <= MODAL_TOP_EPSILON &&
            gestureState.dy > 0.1 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderMove: (_evt, gestureState) => {
          if (gestureState.dy <= 0) return;
          applyModalDragOffset(gestureState.dy);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          settleModalFromGesture(gestureState);
        },
        onPanResponderTerminate: () => {
          resetPublishModalPosition();
        },
      }),
    [applyModalDragOffset, resetPublishModalPosition, settleModalFromGesture, showPublishModal]
  );

  const loadCommunityData = useCallback(async () => {
    const [nextReports, nextRep] = await Promise.all([
      fetchCommunityReports(),
      fetchTopReputation(),
    ]);

    setReports(
      incomingReport && !((nextReports || []).some((report) => String(report.id) === String(incomingReport.id)))
        ? [incomingReport, ...(nextReports || [])]
        : (nextReports || [])
    );
    setReputationRows(nextRep || []);
  }, [incomingReport]);

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
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentFadeAnim, isInitialLoading]);

  useEffect(() => {
    if (!showFocusedSkeleton) {
      focusedSkeletonPulse.stopAnimation();
      focusedSkeletonPulse.setValue(0.78);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(focusedSkeletonPulse, {
          toValue: 0.96,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(focusedSkeletonPulse, {
          toValue: 0.78,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [focusedSkeletonPulse, showFocusedSkeleton]);

  useEffect(() => {
    if (!showPublishModal) return;

    modalDragOffset.setValue(0);
    modalDragValueRef.current = 0;
    modalScrollOffsetRef.current = 0;
    isHandleDraggingRef.current = false;
    modalClosingRef.current = false;
  }, [modalDragOffset, showPublishModal]);

  useEffect(() => {
    const listenerId = modalDragOffset.addListener(({ value }) => {
      modalDragValueRef.current = value;
    });

    return () => {
      modalDragOffset.removeListener(listenerId);
    };
  }, [modalDragOffset]);

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
        await loadCommunityData();

        if (!mounted) return;
      } finally {
        if (mounted && !initialReportsLoadedRef.current) {
          initialReportsLoadedRef.current = true;
          setIsReportsLoading(false);
        }
      }
    };

    load();

    const intervalId = setInterval(() => {
      loadCommunityData().catch(() => {});
    }, 15000);

    const unsubscribe = subscribeToCommunityReports(load);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      unsubscribe();
    };
  }, [loadCommunityData]);

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

  useEffect(() => {
    if (!incomingReportId) {
      didAutoFocusReportRef.current = false;
      setHighlightedReportId('');
      highlightProgress.setValue(0);
      return;
    }

    didAutoFocusReportRef.current = false;
    setHighlightedReportId(incomingReportId);
    highlightProgress.stopAnimation();
    highlightProgress.setValue(1);

    const timeoutId = setTimeout(() => {
      Animated.timing(highlightProgress, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }).start(() => {
        setHighlightedReportId('');
      });
    }, 5000);

    return () => {
      clearTimeout(timeoutId);
      highlightProgress.stopAnimation();
    };
  }, [highlightProgress, incomingReportId]);

  useEffect(() => {
    if (!incomingReportId || !reportsWithInitial.length || didAutoFocusReportRef.current) return;

    const targetReport = reportsWithInitial.find((report) => String(report.id) === String(incomingReportId));
    if (!targetReport) return;

    const targetLayout = reportLayoutRef.current[String(targetReport.id)];
    if (!targetLayout || !scrollRef.current?.scrollTo) return;

    didAutoFocusReportRef.current = true;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetLayout.y - 24),
        animated: true,
      });
    });
  }, [incomingReportId, reportsWithInitial, reportLayoutTick]);

  const handlePublish = async () => {
    const scrollToPublishSection = (sectionKey) => {
      requestAnimationFrame(() => {
        const targetY = publishSectionOffsetsRef.current[sectionKey] ?? 0;
        publishModalScrollRef.current?.scrollTo({
          y: Math.max(0, targetY - 12),
          animated: true,
        });
      });
    };

    setFeedback('');
    setPublishErrors({ spot: '', comment: '', general: '' });

    if (!authUser?.id) {
      setPublishErrors((prev) => ({ ...prev, general: 'Debes iniciar sesion para publicar un reporte.' }));
      scrollToPublishSection('intro');
      return;
    }

    if (!canReportFromHere) {
      setPublishErrors((prev) => ({ ...prev, spot: 'Estas fuera de rango para publicar en esta zona.' }));
      scrollToPublishSection('spot');
      return;
    }

    if (!selectedSpot?.name) {
      setPublishErrors((prev) => ({ ...prev, spot: 'Selecciona una playa para publicar.' }));
      scrollToPublishSection('spot');
      return;
    }

    const comment = newReportText.trim();
    if (comment.length < 8) {
      setPublishErrors((prev) => ({ ...prev, comment: 'Escribe al menos 8 caracteres en el comentario.' }));
      scrollToPublishSection('comment');
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
      setPublishErrors((prev) => ({ ...prev, general: result.error || 'No se pudo publicar el reporte.' }));
      scrollToPublishSection('general');
      return;
    }

    setNewReportText('');
    setFeedback('Reporte publicado correctamente.');
    setShowPublishModal(false);
    await loadCommunityData().catch(() => {});
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

  const focusedReport = useMemo(() => {
    if (!incomingReportId) return null;

    return reportsWithInitial.find((report) => String(report.id) === String(incomingReportId)) || incomingReport;
  }, [incomingReport, incomingReportId, reportsWithInitial]);

  const isFocusedReportHighlighted = String(highlightedReportId || '') === String(incomingReportId || '');

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

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, compact ? styles.scrollContentCompact : null]}
      >
        <View style={[styles.card, styles.reportsCard]}>
          {showFocusedSkeleton ? (
            <View style={styles.focusedSkeletonCard}>
              <Animated.View style={[styles.focusedSkeletonLineShort, { opacity: focusedSkeletonPulse }]} />
              <Animated.View style={[styles.focusedSkeletonLineLong, { opacity: focusedSkeletonPulse }]} />
              <Animated.View style={[styles.focusedSkeletonBlock, { opacity: focusedSkeletonPulse }]} />
            </View>
          ) : null}

          <Text style={[styles.cardTitle, compact ? styles.cardTitleCompact : null]}>Reportes por playa cercana</Text>
          {showLoadingSkeleton ? (
            <View style={styles.loadingWrap}>
              <View style={styles.loadingLineLong} />
              <View style={styles.loadingLineMedium} />
              <View style={styles.loadingBlock} />
              <View style={styles.loadingBlock} />
            </View>
          ) : null}

          {!showLoadingSkeleton ? (
            <Animated.View
              style={{
                opacity: contentFadeAnim,
                transform: [{ translateY: contentTranslateY }],
              }}
            >
              {!reportsByNearbySpot.length ? (
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateTitle}>Aun no hay comentarios cerca tuyo</Text>
                  <Text style={styles.emptyStateText}>
                    Cuando alguien publique una condicion real del mar, la veras aqui al instante.
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyStateAction}
                    onPress={() => setShowPublishModal(true)}
                  >
                    <Text style={styles.emptyStateActionText}>Publicar primer comentario</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {reportsByNearbySpot.map((group) => (
                <View
                  key={group.spotName}
                  style={styles.reportGroupWrap}
                  onLayout={(event) => {
                    groupLayoutRef.current[group.spotName] = event.nativeEvent.layout.y;
                  }}
                >
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
                        highlighted={String(report.id) === String(incomingReportId) && isFocusedReportHighlighted}
                        highlightProgress={highlightProgress}
                        onLayout={(event) => {
                          const groupOffset = groupLayoutRef.current[group.spotName] || 0;
                          reportLayoutRef.current[String(report.id)] = {
                            y: groupOffset + event.nativeEvent.layout.y,
                          };
                          setReportLayoutTick((current) => current + 1);
                        }}
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
        transparent={true}
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={() => setShowPublishModal(false)}
      >
        <Animated.View style={styles.publishModalOverlay}>
          <Animated.View
            style={[
              styles.publishModalContainer,
              {
                marginTop: insets.top + 28,
                transform: [{ translateY: modalDragOffset }],
              },
            ]}
          >
            <View style={styles.publishModalDragZone} {...modalPanResponder.panHandlers}>
              <View style={styles.publishModalDragHandleWrap}>
                <View style={styles.publishModalDragHandle} />
              </View>
            </View>

          <View style={styles.publishModalContentWrap} {...modalContentPanResponder.panHandlers}>
          <ScrollView
            ref={publishModalScrollRef}
            style={styles.publishModalScroll}
            contentContainerStyle={[styles.publishModalContent, { paddingBottom: 120 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            alwaysBounceVertical={false}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            {...modalContentPanResponder.panHandlers}
            onScroll={(event) => {
              const y = event.nativeEvent.contentOffset.y;
              modalScrollOffsetRef.current = y <= MODAL_TOP_EPSILON ? 0 : y;
            }}
            onScrollBeginDrag={(event) => {
              const y = event.nativeEvent.contentOffset.y;
              modalScrollOffsetRef.current = y <= MODAL_TOP_EPSILON ? 0 : y;
            }}
            onScrollEndDrag={(event) => {
              if (modalClosingRef.current || isHandleDraggingRef.current) return;

              const y = event.nativeEvent.contentOffset.y;
              const distance = Math.max(y < 0 ? -y : 0, modalDragValueRef.current);

              if (distance > modalHalfCloseThreshold) {
                closePublishModalWithSlide(event.nativeEvent.velocity?.y || 0);
              } else if (modalDragValueRef.current > 0) {
                resetPublishModalPosition();
              }
            }}
            onMomentumScrollEnd={() => {
              if (!modalClosingRef.current && modalDragValueRef.current > 0) {
                resetPublishModalPosition();
              }
            }}
          >
            <View
              style={styles.publishIntroCard}
              onLayout={(event) => {
                publishSectionOffsetsRef.current.intro = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.publishIntroTitle}>Reporte en vivo</Text>
              <Text style={styles.cardHint}>Lista automatica de playas cercanas segun tu ubicacion actual.</Text>
              <View style={styles.publishStatusRow}>
                <View style={[styles.gpsStatus, canReportFromHere ? styles.gpsStatusOn : styles.gpsStatusOff]}>
                  <Text style={[styles.gpsStatusText, canReportFromHere ? styles.gpsStatusTextOn : null]}>
                    {locationStatus !== 'ready'
                      ? 'Ubicacion pendiente'
                      : canReportFromHere
                        ? 'Puedes reportar desde tu zona actual.'
                        : nearbySpots.length
                          ? `Muy lejos para reportar (${selectedSpotDistance ? (selectedSpotDistance / 1000).toFixed(1) : '--'} km)`
                          : 'No hay playas cercanas dentro del radio permitido'}
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={styles.publishSection}
              onLayout={(event) => {
                publishSectionOffsetsRef.current.spot = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Playa</Text>
                <Text style={styles.sectionHelper}>elige el spot más cercano</Text>
              </View>
              <View style={styles.spotListWrap}>
                {nearbySpots.map((item) => {
                  const selected = item.spot.name === selectedSpotName;
                  return (
                    <TouchableOpacity
                      key={item.spot.id}
                      style={[styles.spotListRow, selected ? styles.spotListRowActive : null]}
                      onPress={() => setSelectedSpotName(item.spot.name)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.spotListLeft}>
                        <View style={[styles.spotRadioOuter, selected ? styles.spotRadioOuterActive : null]}>
                          {selected ? <View style={styles.spotRadioInner} /> : null}
                        </View>
                        <View>
                          <Text style={[styles.spotListPrimary, selected ? styles.spotListPrimaryActive : null]}>
                            {item.spot.name}
                          </Text>
                          <Text style={styles.spotListMeta}>Distancia aprox. {(item.distance / 1000).toFixed(1)} km</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!nearbySpots.length ? (
                <Text style={styles.feedbackText}>No hay spots cercanos disponibles para tu ubicacion.</Text>
              ) : null}
              {publishErrors.spot ? (
                <View style={styles.fieldErrorBox}>
                  <Text style={styles.fieldErrorText}>{publishErrors.spot}</Text>
                </View>
              ) : null}
            </View>

            <View
              style={styles.publishSection}
              onLayout={(event) => {
                publishSectionOffsetsRef.current.comment = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>Comentario</Text>
                <Text style={styles.sectionHelper}>cuenta cómo está realmente</Text>
              </View>
              <TextInput
                value={newReportText}
                onChangeText={setNewReportText}
                style={[styles.reportInput, publishErrors.comment ? styles.reportInputError : null]}
                placeholder="Describe condiciones reales del mar..."
                placeholderTextColor="#5E6C7A"
                multiline
                maxLength={220}
              />
              <View style={styles.inputMetaRow}>
                <Text style={styles.inputMetaHint}>Minimo 8 caracteres</Text>
                <Text style={styles.inputMetaCount}>{newReportText.trim().length}/220</Text>
              </View>
              {publishErrors.comment ? (
                <View style={styles.fieldErrorBox}>
                  <Text style={styles.fieldErrorText}>{publishErrors.comment}</Text>
                </View>
              ) : null}
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

            <View
              onLayout={(event) => {
                publishSectionOffsetsRef.current.general = event.nativeEvent.layout.y;
              }}
            >
              {publishErrors.general ? (
                <View style={styles.fieldErrorBox}>
                  <Text style={styles.fieldErrorText}>{publishErrors.general}</Text>
                </View>
              ) : null}
              {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
            </View>
          </ScrollView>
          </View>

          <View style={[styles.publishModalFooter, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <TouchableOpacity
              style={[styles.publishBtn, styles.publishBtnFullWidth, publishing ? styles.publishBtnDisabled : null]}
              onPress={handlePublish}
              disabled={publishing}
            >
              <Text style={styles.publishBtnText}>{publishing ? 'Publicando...' : 'Publicar reporte'}</Text>
            </TouchableOpacity>
          </View>
          </Animated.View>
        </Animated.View>
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
  focusedSkeletonCard: {
    borderWidth: 1,
    borderColor: '#D6E2EC',
    backgroundColor: '#F8FBFF',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  focusedSkeletonLineShort: {
    width: '32%',
    height: 9,
    borderRadius: 6,
    backgroundColor: '#D6DEE8',
  },
  focusedSkeletonLineLong: {
    width: '88%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#D6DEE8',
  },
  focusedSkeletonBlock: {
    width: '100%',
    height: 52,
    borderRadius: 8,
    backgroundColor: '#E7EDF3',
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
    backgroundColor: '#D6DEE8',
  },
  loadingLineMedium: {
    width: '46%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#D6DEE8',
  },
  loadingBlock: {
    width: '100%',
    height: 64,
    borderRadius: 10,
    backgroundColor: '#E7EDF3',
  },
  repSkeletonWrap: {
    gap: 10,
    paddingTop: 2,
  },
  repSkeletonRow: {
    width: '100%',
    height: 18,
    borderRadius: 8,
    backgroundColor: '#E7EDF3',
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
  emptyStateCard: {
    borderWidth: 1,
    borderColor: '#D6E2EC',
    backgroundColor: '#F8FBFF',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  emptyStateTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyStateText: {
    color: '#475569',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  emptyStateAction: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emptyStateActionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  spotListWrap: {
    gap: 8,
  },
  spotListRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderLeftWidth: 3,
    borderLeftColor: UI_COLORS.panelBorder,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotListRowActive: {
    borderColor: '#0284C7',
    borderLeftWidth: 7,
    borderLeftColor: '#38BDF8',
    backgroundColor: '#EAF6FF',
  },
  spotListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  spotRadioOuter: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  spotRadioOuterActive: {
    borderColor: '#0284C7',
  },
  spotRadioInner: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#0284C7',
  },
  spotListPrimary: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  spotListPrimaryActive: {
    color: '#0C4A6E',
  },
  spotListMeta: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
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
    minHeight: 110,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    color: UI_COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  reportInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  inputMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputMetaHint: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  inputMetaCount: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
  },
  fieldErrorBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fieldErrorText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
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
    color: '#0F5132',
    fontSize: 11,
  },
  reportCard: {
    backgroundColor: UI_COLORS.panelStrong,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    padding: 10,
    gap: 8,
    overflow: 'hidden',
  },
  reportCardHighlighted: {
    borderColor: '#0284C7',
    borderLeftWidth: 4,
    backgroundColor: '#EAF6FF',
    shadowColor: '#0284C7',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  reportHighlightOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#7DD3FC',
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
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  reportGroupMeta: {
    color: '#475569',
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
    flex: 1,
  },
  reportSpotName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  newBadge: {
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  reportMeta: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  reportInfoRow: {
    gap: 8,
  },
  reportSummary: {
    color: '#1E293B',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  reportSummaryRating: {
    fontStyle: 'italic',
    fontWeight: '700',
  },
  reportCommentLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reportCommentBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  reportText: {
    color: '#1E293B',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  reportBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportWind: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
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
    color: '#166534',
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
    color: '#475569',
    width: 30,
    fontSize: 12,
    fontWeight: '700',
  },
  repName: {
    color: '#111827',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  repPoints: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },

  publishModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  publishModalContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: UI_COLORS.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  publishModalDragZone: {
    height: 44,
    justifyContent: 'center',
  },
  publishModalDragHandleWrap: {
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: 'center',
  },
  publishModalDragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  publishModalScroll: {
    flex: 1,
  },
  publishModalContentWrap: {
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
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  sectionLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sectionHelper: {
    color: '#64748B',
    fontSize: 10,
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
