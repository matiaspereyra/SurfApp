import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { UI_COLORS } from '../theme/ui';

export default function AppHeader({
  title,
  subtitle,
  onBack,
  leftElement = null,
  rightElement = null,
  compact = false,
  sideSlotWidth = 56,
  titleStyle = null,
  skipSafeAreaOffset = false,
}) {
  const insets = useSafeAreaInsets();
  const resolvedSideSlotWidth = compact ? 34 : sideSlotWidth;

  return (
    <View style={[styles.headerShell, skipSafeAreaOffset ? null : { marginTop: -insets.top, paddingTop: insets.top }]}>
      <View style={[styles.header, compact ? styles.headerCompact : null]}>
        <View style={styles.leftGroup}>
          {leftElement ? leftElement : onBack ? (
            <TouchableOpacity style={styles.iconBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <ChevronLeft color={UI_COLORS.textPrimary} size={22} />
            </TouchableOpacity>
          ) : null}

          <View style={styles.textWrap}>
            <Text style={[styles.title, compact ? styles.titleCompact : null, titleStyle]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={[styles.rightGroup, { width: resolvedSideSlotWidth }]}>{rightElement}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  header: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCompact: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
  leftGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  rightGroup: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: UI_COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 20,
    textAlign: 'left',
  },
  titleCompact: {
    fontSize: 16,
    lineHeight: 18,
  },
  subtitle: {
    color: UI_COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 0,
    lineHeight: 12,
    textAlign: 'left',
  },
});
