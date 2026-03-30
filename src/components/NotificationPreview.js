import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { X, MapPin } from 'lucide-react-native';
import { formatRelativeMinutes } from '../lib/timeFormat';

export const NotificationPreview = ({
  reporter = 'Usuario',
  spotName = 'Spot',
  text = '',
  minutesAgo = 0,
  userRating = '?',
  windKts = 0,
  onClose = () => {},
  onPress = () => {},
}) => {
  const timeText = formatRelativeMinutes(minutesAgo, { withAgoPrefix: true });

  return (
    <TouchableOpacity 
      style={styles.container}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{reporter}</Text>
            <Text style={styles.subtitle}>reportó en {spotName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={18} color="#5E6C7A" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.text} numberOfLines={2}>
            {text || 'Sin descripción'}
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Estado</Text>
              <View style={[styles.ratingBadge, getRatingColor(userRating)]}>
                <Text style={styles.ratingText}>{userRating}</Text>
              </View>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Viento</Text>
              <Text style={styles.metaValue}>{windKts} kts</Text>
            </View>
          </View>
          <Text style={styles.timeText}>{timeText}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const getRatingColor = (rating) => {
  switch(String(rating).toUpperCase()) {
    case 'EPIC': return styles.ratingEpic;
    case 'GOOD': return styles.ratingGood;
    case 'FAIR': return styles.ratingFair;
    case 'POOR': return styles.ratingPoor;
    default: return styles.ratingFair;
  }
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A2332',
    borderLeftWidth: 4,
    borderLeftColor: '#4A9EFF',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    zIndex: 101,
  },
  content: {
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#8FA5BB',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    marginBottom: 10,
  },
  text: {
    fontSize: 13,
    color: '#D6E6F5',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    color: '#5E6C7A',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ratingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ratingEpic: {
    backgroundColor: '#2ECC71',
  },
  ratingGood: {
    backgroundColor: '#3498DB',
  },
  ratingFair: {
    backgroundColor: '#F39C12',
  },
  ratingPoor: {
    backgroundColor: '#E74C3C',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 11,
    color: '#5E6C7A',
  },
});
