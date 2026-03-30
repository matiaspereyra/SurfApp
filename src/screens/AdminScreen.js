import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';

export default function AdminScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <Text style={styles.subtitle}>Gestion interna de spots y calibracion</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Herramientas</Text>
        <Text style={styles.cardText}>Pronto: calibracion de markers por spot.</Text>
        <Text style={styles.cardText}>Pronto: activar o pausar spots para ingesta de forecast.</Text>
        <Text style={styles.cardText}>Pronto: prioridad de spots para refresco.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B12',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  header: {
    paddingVertical: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: '#8EA2B8',
    fontSize: 12,
    marginTop: 3,
  },
  card: {
    marginTop: 14,
    backgroundColor: '#111923',
    borderWidth: 1,
    borderColor: '#253548',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: '#EAF2FB',
    fontSize: 15,
    fontWeight: '800',
  },
  cardText: {
    color: '#B7C8D9',
    fontSize: 13,
  },
});
