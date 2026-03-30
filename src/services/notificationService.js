import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';

const UUID_V4_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const requestPushPermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const request = await Notifications.requestPermissionsAsync();
  return Boolean(
    request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
};

export const getPushToken = async () => {
  try {
    if (!Device.isDevice) {
      return null;
    }

    const hasPermission = await requestPushPermission();
    if (!hasPermission) {
      return null;
    }

    const rawProjectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;
    const normalizedProjectId = String(rawProjectId || '').trim();
    const projectId = UUID_V4_LIKE_REGEX.test(normalizedProjectId)
      ? normalizedProjectId
      : undefined;

    if (!projectId) {
      return null;
    }

    const { data, error } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (error) {
      return null;
    }
    if (!data) {
      return null;
    }

    return data;
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

export const sendMagicAlertNotification = async ({ title, body, data = {} }) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
    },
    trigger: null,
  });
};
