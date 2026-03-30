import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Heart, MapPin } from 'lucide-react-native';
import { NZ_SPOTS, getSpotShowName } from '../constants/Spots';

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Favoritos</Text>
        <Text style={styles.subtitle}>Tus spots guardados para acceso rapido</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B12',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2634',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#8EA2B8',
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 12,
  },
  rowWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111923',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 96,
    backgroundColor: '#A92727',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cardAnimated: {
    borderRadius: 14,
  },
  card: {
    backgroundColor: '#111923',
    borderWidth: 1,
    borderColor: '#253548',
    borderRadius: 14,
    padding: 12,
    gap: 6,
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
    color: '#EAF2FB',
    fontSize: 14,
    fontWeight: '800',
  },
  cardText: {
    color: '#B7C8D9',
    fontSize: 12,
  },
  cardHint: {
    color: '#8ED0AB',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    color: '#8EA2B8',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 28,
  },
});
