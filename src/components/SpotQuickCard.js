import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Waves } from 'lucide-react-native';
import { SURFLINE_COLORS, getSpotShowName } from '../constants/Spots';

export const SpotQuickCard = ({ spot, onOpenForecast }) => {
  if (!spot) return null;

  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(42)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(42);
    scale.setValue(0.96);

    Animated.sequence([
      Animated.delay(90),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 430,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 9,
          tension: 62,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [opacity, translateY, scale, spot?.id]);

  const handlePress = () => onOpenForecast();

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          bottom: 120 + insets.bottom + 4,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Pressable 
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }
        ]}
      >
        <View style={[styles.indicator, { backgroundColor: SURFLINE_COLORS[spot.rating] }]} />
        <View style={styles.content}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{getSpotShowName(spot)}</Text>
            <View style={styles.row}>
              <Waves size={14} color="#8E9196" />
              <Text style={styles.details}> {spot.height} FT • {spot.rating}</Text>
            </View>
            <Text style={styles.ctaHint}>Tap para ver forecast completo</Text>
          </View>
          <View style={styles.button}>
            <ChevronRight color="#FFF" size={24} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  card: { 
    backgroundColor: '#161B22', 
    borderRadius: 16, 
    flexDirection: 'row', 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#30363D',
    height: 90,
    // Sombra para iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    // Sombra para Android
    elevation: 8,
  },
  indicator: { width: 10 },
  content: { flex: 1, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  details: { color: '#8E9196', fontSize: 14, fontWeight: '600' },
  ctaHint: { color: '#9FB3C8', fontSize: 11, marginTop: 6, fontWeight: '600' },
  button: { backgroundColor: '#30363D', padding: 8, borderRadius: 24 },
});