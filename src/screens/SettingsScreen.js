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
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <Text style={styles.headerSubtitle}>ACCOUNT PANEL</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

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
    backgroundColor: UI_COLORS.appBg,
  },
  atmosphereOne: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#0D3147',
    opacity: 0.24,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -130,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#0A2436',
    opacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.panel,
    borderWidth: 1,
    borderColor: UI_COLORS.panelBorder,
    borderRadius: 4,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.panelBorder,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    color: UI_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: UI_COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
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
