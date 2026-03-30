import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Heart, MapPin } from 'lucide-react-native';
import { NZ_SPOTS, getSpotShowName } from '../constants/Spots';
import { UI_COLORS, UI_RADIUS, isCompactLayout } from '../theme/ui';

const SWIPE_OPEN_X = -96;
const SWIPE_OPEN_THRESHOLD = -48;

function FavoriteSpotRow({ spot, isOpen, onRequestOpen, onRequestClose, onOpenSpot, onRemoveFavorite }) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: isOpen ? SWIPE_OPEN_X : 0,
      useNativeDriver: true,
      friction: 10,
      tension: 70,
    }).start();
  }, [isOpen, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const horizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        return horizontal && Math.abs(gestureState.dx) > 8;
      },
      onPanResponderMove: (_, gestureState) => {
        const nextX = Math.max(SWIPE_OPEN_X, Math.min(0, (isOpen ? SWIPE_OPEN_X : 0) + gestureState.dx));
        translateX.setValue(nextX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldOpen = isOpen
          ? gestureState.dx < 24
          : gestureState.dx < SWIPE_OPEN_THRESHOLD;

        if (shouldOpen) {
          onRequestOpen(spot.name);
          return;
        }

        onRequestClose();
      },
      onPanResponderTerminate: () => {
        if (isOpen) {
          onRequestOpen(spot.name);
          return;
        }
        onRequestClose();
      },
    })
  ).current;

  const today = spot.forecast?.[0];

  return (
    <View style={styles.rowWrap}>
      <TouchableOpacity style={styles.deleteAction} onPress={() => onRemoveFavorite?.(spot.name)}>
        <Text style={styles.deleteActionText}>Eliminar</Text>
      </TouchableOpacity>

      <Animated.View style={[styles.cardAnimated, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.card}
          onPress={() => {
            if (isOpen) {
              onRequestClose();
              return;
            }
            onOpenSpot?.(spot);
          }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.spotRow}>
              <MapPin size={15} color="#9DB3C8" />
              <Text style={styles.spotName}>{getSpotShowName(spot)}</Text>
            </View>
            <Heart size={16} color="#00D15D" fill="#00D15D" />
          </View>

          <Text style={styles.cardText}>Hoy: {today?.waveHeight || '--'}m · {today?.rating || '--'} · Viento {today?.windSpeed || '--'}kts</Text>
          <Text style={styles.cardHint}>Toca para abrir en el mapa</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function FavoritesScreen({ favoriteSpotNames = [], onOpenSpot, onRemoveFavorite = () => {} }) {
  const [openSpotName, setOpenSpotName] = useState('');
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const compact = isCompactLayout(width);

  const favorites = useMemo(
    () => NZ_SPOTS.filter((spot) => favoriteSpotNames.includes(spot.name)),
    [favoriteSpotNames]
  );

  useEffect(() => {
    if (!openSpotName) return;
    if (!favoriteSpotNames.includes(openSpotName)) {
      setOpenSpotName('');
    }
  }, [favoriteSpotNames, openSpotName]);

  useEffect(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.atmosphereOne} pointerEvents="none" />

      <View style={[styles.header, compact ? styles.headerCompact : null]}>
        <Text style={[styles.title, compact ? styles.titleCompact : null]}>Favoritos</Text>
        <Text style={styles.subtitle}>Tus spots guardados para acceso rapido</Text>
      </View>

      <Animated.ScrollView style={{ opacity: contentOpacity }} contentContainerStyle={[styles.scrollContent, compact ? styles.scrollContentCompact : null]}>
        {favorites.map((spot) => (
          <FavoriteSpotRow
            key={spot.id}
            spot={spot}
            isOpen={openSpotName === spot.name}
            onRequestOpen={setOpenSpotName}
            onRequestClose={() => setOpenSpotName('')}
            onOpenSpot={onOpenSpot}
            onRemoveFavorite={onRemoveFavorite}
          />
        ))}

        {!favorites.length ? <Text style={styles.emptyText}>No tienes spots favoritos todavia.</Text> : null}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.appBg,
  },
  atmosphereOne: {
    position: 'absolute',
    top: -130,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#0D2A3C',
    opacity: 0.3,
  },
  header: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: 'rgba(8, 20, 30, 0.78)',
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorderSoft,
    borderRadius: UI_RADIUS.md,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.panelBorderSoft,
  },
  headerCompact: {
    marginHorizontal: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  title: {
    color: UI_COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  titleCompact: {
    fontSize: 20,
  },
  subtitle: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 12,
  },
  scrollContentCompact: {
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 10,
  },
  rowWrap: {
    borderRadius: UI_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: UI_COLORS.panel,
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 96,
    backgroundColor: UI_COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cardAnimated: {
    borderRadius: UI_RADIUS.md,
  },
  card: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: UI_RADIUS.md,
    padding: 12,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spotName: {
    color: UI_COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  cardText: {
    color: UI_COLORS.textSecondary,
    fontSize: 12,
  },
  cardHint: {
    color: '#8ED0AB',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    color: UI_COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 28,
  },
});
