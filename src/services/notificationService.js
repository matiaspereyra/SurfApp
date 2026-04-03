import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestPushPermission = async () => {
  if (!Device.isDevice) {
    return false;
  }

  try {
    const settings = await Notifications.getPermissionsAsync();
    let finalStatus = settings.status;

    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3A7CA5',
      });
    }

    return true;
  } catch (_error) {
    return false;
  }
};

export const getPushToken = async () => {
  if (!Device.isDevice) {
    return null;
  }

  const granted = await requestPushPermission();
  if (!granted) {
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return tokenResponse?.data || null;
  } catch (_error) {
    return null;
  }
};

export const savePushTokenToDatabase = async (token) => {
  if (!token || !supabase) {
    return false;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) return false;
    if (!authData?.user?.id) {
      return false;
    }

    const { error } = await supabase.rpc('save_push_token', {
      p_token: token,
    });

    if (error) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
};

export const savePushPresenceToDatabase = async (isForeground) => {
  if (!supabase) {
    return false;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) return false;
    if (!authData?.user?.id) {
      return false;
    }

    const { error } = await supabase.rpc('save_push_presence', {
      p_is_foreground: !!isForeground,
    });

    if (error) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
};

export const sendMagicAlertNotification = async ({ title, body, data = {} }) => {
  return false;
};
