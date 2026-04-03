import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppState, View, StyleSheet, StatusBar, Animated, ActivityIndicator, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapScreen from './src/screens/MapScreen';
import ForecastScreen from './src/screens/ForecastScreen';
import AuthScreen from './src/screens/AuthScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import AdminScreen from './src/screens/AdminScreen';
import { SpotQuickCard } from './src/components/SpotQuickCard';
import BottomNavigation from './src/components/BottomNavigation';
import { getCurrentUser, onAuthStateChange } from './src/services/authService';
import { ensureUserProfile } from './src/services/profileService';
import { getPushToken, savePushTokenToDatabase, savePushPresenceToDatabase } from './src/services/notificationService';
import { NZ_SPOTS } from './src/constants/Spots';

const FAVORITES_STORAGE_KEY = 'surfapp:favorites:v1';
const DEFAULT_FAVORITE_SPOT_NAMES = ['Piha', 'Muriwai', 'Raglan', 'Mount Maunganui'];
const ADMIN_EMAILS = new Set(['matiaspereyra999@gmail.com']);

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('map');
  const [forecastReturnScreen, setForecastReturnScreen] = useState('map');
  const [activeSpot, setActiveSpot] = useState(null);
  const [favoriteSpotNames, setFavoriteSpotNames] = useState(DEFAULT_FAVORITE_SPOT_NAMES);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [communityInitialSpotName, setCommunityInitialSpotName] = useState('');
  const [communityInitialReportId, setCommunityInitialReportId] = useState('');
  const [communityInitialReport, setCommunityInitialReport] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const mapOpacity = useRef(new Animated.Value(1)).current;
  const mapSlide = useRef(new Animated.Value(0)).current;
  const forecastOpacity = useRef(new Animated.Value(0)).current;
  const forecastSlide = useRef(new Animated.Value(300)).current;
  const pushSetupAttemptedRef = useRef(false);
  const lastPushSetupUserIdRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const isAdmin = ADMIN_EMAILS.has(String(authUser?.email || '').toLowerCase());

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const user = await getCurrentUser();
        if (mounted) {
          setAuthUser(user);
          if (user) {
            const profile = await ensureUserProfile(user);
            if (mounted) {
              setAuthProfile(profile);
            }
          }
        }
      } catch (error) {
        console.log('Auth bootstrap error:', error);
        if (mounted) {
          setAuthUser(null);
          setAuthProfile(null);
        }
      } finally {
        if (mounted) {
          setAuthBootstrapped(true);
        }
      }
    };

    bootstrap();

    const unsubscribe = onAuthStateChange(async (user) => {
      setAuthUser(user);
      if (user) {
        const profile = await ensureUserProfile(user);
        setAuthProfile(profile);
      } else {
        setAuthProfile(null);
      }
      if (!user) {
        setCurrentScreen('map');
        setActiveSpot(null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authBootstrapped || !authUser) return;
    if (lastPushSetupUserIdRef.current === authUser.id && pushSetupAttemptedRef.current) return;

    let mounted = true;
    pushSetupAttemptedRef.current = true;
    lastPushSetupUserIdRef.current = authUser.id;

    const setupPushNotifications = async () => {
      try {
        for (let attempt = 1; attempt <= 3 && mounted; attempt += 1) {
          const token = await getPushToken();
          if (!token) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }

          const saved = await savePushTokenToDatabase(token);
          if (saved) {
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (_error) {
        // Silent: push setup may fail in simulators or without permissions.
      }
    };

    setupPushNotifications();

    const markPresence = async (isForeground) => {
      await savePushPresenceToDatabase(isForeground).catch(() => {});
    };

    markPresence(true);

    const heartbeatId = setInterval(() => {
      if (appStateRef.current === 'active') {
        markPresence(true);
      }
    }, 30000);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;

      if (nextState === 'active') {
        markPresence(true);
      } else if (wasActive && nextState.match(/inactive|background/)) {
        markPresence(false);
      }
    });

    return () => {
      mounted = false;
      clearInterval(heartbeatId);
      appStateSubscription.remove();
      savePushPresenceToDatabase(false).catch(() => {});
    };
  }, [authBootstrapped, authUser]);

  useEffect(() => {
    let mounted = true;

    const loadFavorites = async () => {
      try {
        const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!mounted) return;

        if (!raw) {
          setFavoritesLoaded(true);
          return;
        }

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((name) => typeof name === 'string' && name.trim().length > 0);
          setFavoriteSpotNames(cleaned);
        }
      } catch (error) {
        console.log('Error loading favorites:', error);
      } finally {
        if (mounted) {
          setFavoritesLoaded(true);
        }
      }
    };

    loadFavorites();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;

    const persistFavorites = async () => {
      try {
        await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteSpotNames));
      } catch (error) {
        console.log('Error saving favorites:', error);
      }
    };

    persistFavorites();
  }, [favoriteSpotNames, favoritesLoaded]);

  const toggleFavoriteSpot = useCallback((spotName) => {
    if (!spotName) return;

    setFavoriteSpotNames((prev) => {
      if (prev.includes(spotName)) {
        return prev.filter((name) => name !== spotName);
      }
      return [...prev, spotName];
    });
  }, []);

  const removeFavoriteSpot = useCallback((spotName) => {
    if (!spotName) return;
    setFavoriteSpotNames((prev) => prev.filter((name) => name !== spotName));
  }, []);

  const isSpotFavorite = useCallback(
    (spotName) => favoriteSpotNames.includes(spotName),
    [favoriteSpotNames]
  );

  const handleOpenForecast = () => {
    setForecastReturnScreen('map');

    Animated.parallel([
      Animated.timing(mapOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(mapSlide, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(forecastOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(forecastSlide, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentScreen('forecast');
    });
  };

  const handleOpenSpotForecast = (spotName, sourceScreen = currentScreen) => {
    const spot = NZ_SPOTS.find((s) => s.name.toLowerCase() === spotName.toLowerCase());
    if (spot) {
      setActiveSpot(spot);
      const returnScreen =
        sourceScreen === 'community'
          ? 'community'
          : sourceScreen === 'favorites'
            ? 'favorites'
            : 'map';
      setForecastReturnScreen(returnScreen);

      if (returnScreen === 'map') {
        Animated.parallel([
          Animated.timing(mapOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(mapSlide, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(forecastOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(forecastSlide, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setCurrentScreen('forecast');
        });
        return;
      }

      Animated.parallel([
        Animated.timing(forecastOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(forecastSlide, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentScreen('forecast');
      });
    }
  };

  const handleBack = () => {
    if (forecastReturnScreen === 'community') {
      Animated.parallel([
        Animated.timing(forecastOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(forecastSlide, {
          toValue: 300,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentScreen('community');
      });
      return;
    }

    if (forecastReturnScreen === 'favorites') {
      Animated.parallel([
        Animated.timing(forecastOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(forecastSlide, {
          toValue: 300,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentScreen('favorites');
      });
      return;
    }

    Animated.parallel([
      Animated.timing(forecastOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(forecastSlide, {
        toValue: 300,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(mapOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(mapSlide, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentScreen('map');
    });
  };

  const handleSpotSelect = (spot) => {
    setActiveSpot(spot);
  };

  const handleOpenSettings = () => {
    setMapExpanded(false);
    setActiveSpot(null);
    setCurrentScreen('settings');
  };

  const handleOpenCommunity = (spotName = '', reportId = '', report = null) => {
    setMapExpanded(false);
    setActiveSpot(null);
    setCommunityInitialSpotName(String(spotName || ''));
    setCommunityInitialReportId(String(reportId || ''));
    setCommunityInitialReport(report && typeof report === 'object' ? report : null);
    setCurrentScreen('community');
  };

  const handleCommunityInitialSpotConsumed = useCallback(() => {
    console.log('Clearing initialReportId');
    setCommunityInitialSpotName('');
    setCommunityInitialReportId('');
    setCommunityInitialReport(null);
  }, []);

  const handleBackFromSettings = () => {
    setCurrentScreen('map');
  };

  const handleBackFromCommunity = () => {
    setCurrentScreen('map');
  };

  const handleOpenFavoriteSpot = (spot) => {
    handleOpenSpotForecast(spot?.name, 'favorites');
  };

  const handleBottomNavigationChange = (nextScreen) => {
    if (nextScreen === 'admin' && !isAdmin) {
      setCurrentScreen('map');
      return;
    }

    if (nextScreen !== 'map') {
      setMapExpanded(false);
      setActiveSpot(null);
    }
    setCurrentScreen(nextScreen);
  };

  const handleProfileUpdated = (profile) => {
    setAuthProfile(profile);
  };

  if (!authBootstrapped) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0EA5E9" />
          <Text style={styles.loadingText}>Cargando SurfApp...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!authUser) {
    return (
      <SafeAreaProvider>
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        
        {currentScreen === 'map' && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: mapOpacity,
              transform: [{ translateX: mapSlide }],
            },
          ]}
          pointerEvents={currentScreen === 'map' ? 'auto' : 'none'}
        >
          <View style={{ flex: 1 }} pointerEvents="box-none">
            <MapScreen 
              onSpotSelect={handleSpotSelect} 
              selectedSpot={activeSpot}
              authUser={authUser}
              authProfile={authProfile}
              onProfileUpdated={handleProfileUpdated}
              onOpenCommunity={handleOpenCommunity}
              onOpenForecast={handleOpenForecast}
            />
            
            {activeSpot && (
              <SpotQuickCard 
                spot={activeSpot} 
                onOpenForecast={handleOpenForecast} 
              />
            )}
          </View>
        </Animated.View>
      )}

      {currentScreen === 'forecast' && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: forecastOpacity,
              transform: [{ translateX: forecastSlide }],
            },
          ]}
          pointerEvents={currentScreen === 'forecast' ? 'auto' : 'none'}
        >
          <ForecastScreen 
            spot={activeSpot} 
            onBack={handleBack}
            authUser={authUser}
            isFavorite={isSpotFavorite(activeSpot?.name)}
            onToggleFavorite={toggleFavoriteSpot}
          />
        </Animated.View>
      )}

      {currentScreen === 'settings' && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: 1,
              transform: [{ translateX: 0 }],
            },
          ]}
          pointerEvents="auto"
        >
          <SettingsScreen
            authUser={authUser}
            authProfile={authProfile}
            onProfileUpdated={handleProfileUpdated}
            onBack={handleBackFromSettings}
          />
        </Animated.View>
      )}

      {currentScreen === 'community' && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: 1,
              transform: [{ translateX: 0 }],
            },
          ]}
          pointerEvents="auto"
        >
          <CommunityScreen
            authUser={authUser}
            initialSpotName={communityInitialSpotName}
            initialReportId={communityInitialReportId}
            initialReport={communityInitialReport}
            onInitialSpotConsumed={handleCommunityInitialSpotConsumed}
            onBack={handleBackFromCommunity}
            onOpenSpotForecast={(spotName) => handleOpenSpotForecast(spotName, 'community')}
          />
        </Animated.View>
      )}

      {currentScreen === 'favorites' && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: 1,
              transform: [{ translateX: 0 }],
            },
          ]}
          pointerEvents="auto"
        >
          <FavoritesScreen
            favoriteSpotNames={favoriteSpotNames}
            onOpenSpot={handleOpenFavoriteSpot}
            onRemoveFavorite={removeFavoriteSpot}
          />
        </Animated.View>
      )}

      {currentScreen === 'admin' && isAdmin && (
        <Animated.View
          style={[
            styles.screen,
            {
              opacity: 1,
              transform: [{ translateX: 0 }],
            },
          ]}
          pointerEvents="auto"
        >
          <AdminScreen />
        </Animated.View>
      )}

      {currentScreen !== 'forecast' ? (
        <BottomNavigation
          currentScreen={currentScreen}
          onChange={handleBottomNavigationChange}
          isAdmin={isAdmin}
        />
      ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  screen: { flex: 1, backgroundColor: '#000' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
});