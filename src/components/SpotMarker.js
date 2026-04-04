import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

const toMetersLabel = (heightValue) => {
  const raw = String(heightValue || '').trim();
  if (!raw) return '--';

  if (/m|metros?/i.test(raw)) {
    return raw.replace(/\s*m(?:etros?)?/gi, '').trim() || '--';
  }

  const matches = raw.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return raw;

  const meters = matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => (value * 0.3048).toFixed(1));

  return meters.join('-') || '--';
};

export const SpotMarker = ({ spot, onPress, isSelected = false }) => (
  <Marker
    coordinate={{ latitude: spot.markerLat ?? spot.lat, longitude: spot.markerLng ?? spot.lng }}
    onPress={() => onPress(spot)}
    propagatePress={false}
  >
    <View
      style={[
        styles.marker,
        { backgroundColor: spot.markerColor || '#64748B' },
        isSelected && styles.markerSelected,
      ]}
    >
      <Text style={styles.markerText}>{toMetersLabel(spot.height)}</Text>
    </View>
  </Marker>
);

const styles = StyleSheet.create({
  marker: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    borderColor: '#00D15D',
    transform: [{ scale: 1.12 }],
  },
  markerText: { color: 'white', fontWeight: 'bold', fontSize: 10 },
});