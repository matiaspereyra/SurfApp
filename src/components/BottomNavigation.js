import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Heart, House, Settings, Shield, Users } from 'lucide-react-native';

const ITEMS = [
  { key: 'map', label: 'Inicio', Icon: House },
  { key: 'community', label: 'Community', Icon: Users },
  { key: 'favorites', label: 'Favoritos', Icon: Heart },
  { key: 'settings', label: 'Settings', Icon: Settings },
  { key: 'admin', label: 'Admin', Icon: Shield, adminOnly: true },
];

export default function BottomNavigation({ currentScreen, onChange, isAdmin = false }) {
  const visibleItems = ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <View style={styles.wrap}>
      {visibleItems.map(({ key, label, Icon }) => {
        const active = currentScreen === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.item, active ? styles.itemActive : null]}
            onPress={() => onChange(key)}
            activeOpacity={0.85}
          >
            <Icon size={18} color={active ? '#07110B' : '#9EB3C8'} />
            <Text style={[styles.itemText, active ? styles.itemTextActive : null]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    flexDirection: 'row',
    backgroundColor: '#0E1621',
    borderWidth: 1,
    borderColor: '#243648',
    borderRadius: 16,
    padding: 6,
    zIndex: 40,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 4,
    paddingVertical: 8,
  },
  itemActive: {
    backgroundColor: '#00D15D',
  },
  itemText: {
    color: '#9EB3C8',
    fontSize: 10,
    fontWeight: '700',
  },
  itemTextActive: {
    color: '#07110B',
  },
});
