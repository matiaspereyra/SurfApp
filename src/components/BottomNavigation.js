import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Heart, House, Settings, Shield, Users } from 'lucide-react-native';
import { UI_COLORS, UI_RADIUS } from '../theme/ui';

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
            <Icon size={18} color={active ? UI_COLORS.accentText : UI_COLORS.textSecondary} />
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
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: UI_RADIUS.lg,
    padding: 6,
    zIndex: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: UI_RADIUS.md,
    gap: 4,
    paddingVertical: 8,
  },
  itemActive: {
    backgroundColor: UI_COLORS.accent,
  },
  itemText: {
    color: UI_COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  itemTextActive: {
    color: UI_COLORS.accentText,
  },
});
