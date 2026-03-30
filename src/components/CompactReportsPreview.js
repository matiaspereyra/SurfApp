import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { X, MapPin } from 'lucide-react-native';
import { formatRelativeMinutes } from '../lib/timeFormat';

export const CompactReportsPreview = ({
  reports = [],
  onClose = () => {},
  onReportPress = () => {},
}) => {
  console.log('CompactReportsPreview rendered with', reports.length, 'reports');
  if (!reports.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Reportes recientes (3h)</Text>
          <Text style={styles.subtitle}>{reports.length} mensajes en tu zona</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
          <X size={20} color="#8FA5BB" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.reportsList}
        showsVerticalScrollIndicator={false}
      >
        {reports.map((report, idx) => (
          <TouchableOpacity
            key={`${report.id}-${idx}`}
            style={styles.reportItem}
            onPress={() => {
              console.log('CompactReportsPreview item pressed:', report.id);
              onReportPress(report);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.reportHeader}>
              <MapPin size={12} color="#8FA5BB" />
              <Text style={styles.spotName}>{report.spotName}</Text>
              <Text style={styles.time}>{formatRelativeMinutes(report.minutesAgo)}</Text>
            </View>
            <Text style={styles.reportText} numberOfLines={1}>
              {report.text}
            </Text>
            <View style={styles.reportFooter}>
              <View style={[styles.ratingBadge, getRatingColor(report.rating)]}>
                <Text style={styles.ratingText}>{report.rating}</Text>
              </View>
              <Text style={styles.reporter}>{report.reporter}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
    maxHeight: 320,
    backgroundColor: '#0F1823',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2A36',
    overflow: 'hidden',
    marginHorizontal: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    zIndex: 101,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2634',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#8FA5BB',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsList: {
    maxHeight: 260,
  },
  reportItem: {
    width: '100%',
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2634',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  spotName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D6E6F5',
    flex: 1,
  },
  time: {
    fontSize: 10,
    color: '#5E6C7A',
  },
  reportText: {
    fontSize: 11,
    color: '#AFC3D6',
    marginBottom: 6,
    lineHeight: 15,
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: 9,
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
  reporter: {
    fontSize: 10,
    color: '#8FA5BB',
  },
});
