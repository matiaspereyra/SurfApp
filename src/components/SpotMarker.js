import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { SURFLINE_COLORS } from '../constants/Spots';

export const SpotMarker = ({ spot, onPress, isSelected = false }) => (
  <Marker
    coordinate={{ latitude: spot.markerLat ?? spot.lat, longitude: spot.markerLng ?? spot.lng }}
    onPress={() => onPress(spot)}
    propagatePress={false}
  >
    <View
      style={[
        styles.marker,
        { backgroundColor: SURFLINE_COLORS[spot.rating] },
        isSelected && styles.markerSelected,
      ]}
    >
      <Text style={styles.markerText}>{spot.height}</Text>
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