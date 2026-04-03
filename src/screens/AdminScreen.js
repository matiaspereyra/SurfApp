import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { UI_COLORS, UI_RADIUS, UI_SPACE, UI_TYPE } from '../theme/ui';
import AppHeader from '../components/AppHeader';

export default function AdminScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Admin Panel" subtitle="Gestion interna de spots y calibracion" compact />

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Centro Operativo</Text>
          <Text style={styles.cardText}>Pronto: calibracion de markers por spot.</Text>
          <Text style={styles.cardText}>Pronto: activar o pausar spots para ingesta de forecast.</Text>
          <Text style={styles.cardText}>Pronto: prioridad de spots para refresco.</Text>
        </View>

        <View style={styles.cardRow}>
          <View style={[styles.miniCard, styles.miniCardLeft]}>
            <Text style={styles.miniLabel}>PUSH</Text>
            <Text style={styles.miniValue}>Alertas</Text>
            <Text style={styles.miniHint}>Estado y límites</Text>
          </View>
          <View style={[styles.miniCard, styles.miniCardRight]}>
            <Text style={styles.miniLabel}>FORECAST</Text>
            <Text style={styles.miniValue}>Runs</Text>
            <Text style={styles.miniHint}>Prioridad spots</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.panel,
    paddingTop: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: UI_SPACE.md,
    paddingTop: 10,
  },
  card: {
    marginTop: 14,
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: UI_RADIUS.md,
    padding: 14,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  cardTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: UI_TYPE.bodyMd,
    fontWeight: '800',
  },
  cardText: {
    color: UI_COLORS.textSecondary,
    fontSize: UI_TYPE.bodySm,
  },
  cardRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  miniCard: {
    flex: 1,
    borderRadius: UI_RADIUS.md,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  miniCardLeft: {
    backgroundColor: '#102432',
    borderColor: '#325A72',
  },
  miniCardRight: {
    backgroundColor: '#132231',
    borderColor: '#2F536A',
  },
  miniLabel: {
    color: '#8FB7D4',
    fontSize: UI_TYPE.caption,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  miniValue: {
    color: UI_COLORS.textPrimary,
    fontSize: UI_TYPE.titleMd,
    fontWeight: '800',
  },
  miniHint: {
    color: UI_COLORS.textMuted,
    fontSize: UI_TYPE.caption,
  },
});
