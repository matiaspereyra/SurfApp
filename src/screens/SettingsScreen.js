import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { updateUserProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';
import { UI_COLORS, UI_RADIUS } from '../theme/ui';

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
      <View style={styles.atmosphereOne} pointerEvents="none" />
      <View style={styles.atmosphereTwo} pointerEvents="none" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ChevronLeft color="#FFFFFF" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Perfil</Text>
          <TextInput
            value={profileName}
            onChangeText={setProfileName}
            style={styles.input}
            placeholder="Nombre publico"
            placeholderTextColor="#5E6C7A"
          />
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
          <Text style={styles.cardTitle}>Sesion</Text>
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
    backgroundColor: UI_COLORS.appBg,
  },
  atmosphereOne: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#0F3043',
    opacity: 0.28,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -130,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#0A1E2C',
    opacity: 0.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(8, 20, 30, 0.78)',
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorderSoft,
    borderRadius: UI_RADIUS.md,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.panelBorderSoft,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: UI_RADIUS.md,
    padding: 13,
    gap: 9,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  cardTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  input: {
    height: 40,
    backgroundColor: '#0B1620',
    borderWidth: 1,
    borderColor: '#2C4A61',
    borderRadius: UI_RADIUS.sm,
    paddingHorizontal: 10,
    color: UI_COLORS.textPrimary,
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: UI_COLORS.accent,
    borderRadius: UI_RADIUS.sm,
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
    color: '#9FD8B4',
    fontSize: 11,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: UI_COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#7A2B36',
    borderRadius: UI_RADIUS.sm,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#FFC7D0',
    fontSize: 12,
    fontWeight: '800',
  },
});
