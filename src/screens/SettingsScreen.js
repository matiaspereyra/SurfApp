import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { updateUserProfile } from '../services/profileService';
import { signOutUser } from '../services/authService';

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
    backgroundColor: '#050B12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2634',
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: '#111923',
    borderWidth: 1,
    borderColor: '#253548',
    borderRadius: 14,
    padding: 12,
    gap: 9,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  input: {
    height: 40,
    backgroundColor: '#0B1219',
    borderWidth: 1,
    borderColor: '#243444',
    borderRadius: 9,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: '#00D15D',
    borderRadius: 9,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#001108',
    fontSize: 12,
    fontWeight: '800',
  },
  ratingPillOn: {
    backgroundColor: '#00D15D',
    borderColor: '#00D15D',
  },
  ratingText: {
    color: '#9FB3C8',
    fontSize: 11,
    fontWeight: '800',
  },
  ratingTextOn: {
    color: '#07110B',
  },
});
