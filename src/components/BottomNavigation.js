import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Heart, House, Settings, Shield, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UI_COLORS } from '../theme/ui';

const ITEMS = [
  { key: 'map', label: 'Inicio', Icon: House },
  { key: 'community', label: 'Community', Icon: Users },
  { key: 'favorites', label: 'Favoritos', Icon: Heart },
  { key: 'settings', label: 'Settings', Icon: Settings },
  { key: 'admin', label: 'Admin', Icon: Shield, adminOnly: true },
];

export default function BottomNavigation({ currentScreen, onChange, isAdmin = false }) {
  const insets = useSafeAreaInsets();
  const visibleItems = ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <View style={[styles.wrap, { paddingBottom: 10 + insets.bottom }]}> 
      {visibleItems.map(({ key, label, Icon }) => {
        const active = currentScreen === key;
        return (
          <TouchableOpacity
            key={key}
            style={[styles.item, active ? styles.itemActive : null]}
            onPress={() => onChange(key)}
            activeOpacity={0.85}
          >
            <Icon
              size={19}
              strokeWidth={1.8}
              color={active ? '#0B0B0B' : '#4B5563'}
            />
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
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#D6DEE7',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    gap: 3,
    paddingVertical: 6,
  },
  itemActive: {
    backgroundColor: 'transparent',
  },
  itemText: {
    color: '#4B5563',
    fontSize: 9,
    fontWeight: '500',
  },
  itemTextActive: {
    color: '#0B0B0B',
    fontWeight: '800',
  },
});
