import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { updateUserProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { UI_COLORS, UI_RADIUS } from '../theme/ui';
import AppHeader from '../components/AppHeader';

export default function SettingsScreen({ authUser, authProfile, onBack, onProfileUpdated }) {
  const [profileName, setProfileName] = useState(authProfile?.display_name || '');
  const [profileCity, setProfileCity] = useState(authProfile?.home_city || 'Auckland');
  const [profileMsg, setProfileMsg] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setProfileName(authProfile?.display_name || '');
    setProfileCity(authProfile?.home_city || 'Auckland');
  }, [authProfile?.display_name, authProfile?.home_city]);


  const handleSaveProfile = async () => {
    setProfileMsg('');
    if (!authUser?.id) {
      setProfileMsg('No hay usuario autenticado.');
      return;
    }

    const displayName = profileName.trim();
    const homeCity = profileCity.trim();
    if (!displayName || !homeCity) {
      setProfileMsg('Completa nombre y ciudad.');
      return;
    }

    setSavingProfile(true);
    const result = await updateUserProfile({
      userId: authUser.id,
      displayName,
      homeCity,
    });
    setSavingProfile(false);

    if (!result.ok) {
      setProfileMsg(result.error || 'No se pudo guardar perfil.');
      return;
    }

    onProfileUpdated?.(result.profile);
    setProfileMsg('Perfil actualizado.');
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOutUser();
    setLoggingOut(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader title="Settings" subtitle="ACCOUNT PANEL" compact onBack={onBack} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PERFIL</Text>
          <Text style={styles.fieldLabel}>NOMBRE PUBLICO</Text>
          <TextInput
            value={profileName}
            onChangeText={setProfileName}
            style={styles.input}
            placeholder="Nombre publico"
            placeholderTextColor="#5E6C7A"
          />
          <Text style={styles.fieldLabel}>CIUDAD BASE</Text>
          <TextInput
            value={profileCity}
            onChangeText={setProfileCity}
            style={styles.input}
            placeholder="Ciudad"
            placeholderTextColor="#5E6C7A"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={savingProfile}>
            <Text style={styles.saveBtnText}>{savingProfile ? 'Guardando...' : 'Guardar perfil'}</Text>
          </TouchableOpacity>
          {profileMsg ? <Text style={styles.msgText}>{profileMsg}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>SESION</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
            <Text style={styles.logoutBtnText}>{loggingOut ? 'Cerrando...' : 'Cerrar sesion'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_COLORS.panel,
  },
  scrollContent: {
    padding: 14,
    gap: 10,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    padding: 12,
    gap: 9,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  cardTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  fieldLabel: {
    color: UI_COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  input: {
    height: 40,
    backgroundColor: UI_COLORS.panelStrong,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    paddingHorizontal: 10,
    color: UI_COLORS.textPrimary,
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: UI_COLORS.accent,
    borderRadius: 4,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: UI_COLORS.accentText,
    fontSize: 12,
    fontWeight: '800',
  },
  msgText: {
    color: UI_COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: UI_COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: UI_COLORS.danger,
    borderRadius: 4,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: UI_COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
});
