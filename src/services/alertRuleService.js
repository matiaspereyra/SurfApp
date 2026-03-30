import { isSupabaseConfigured, supabase } from '../lib/supabase';

const parseSpotNames = (spotNameRaw) => {
  if (!spotNameRaw || typeof spotNameRaw !== 'string') {
    return [];
  }

  const parsed = spotNameRaw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  return parsed;
};

const serializeSpotNames = (spotNames) => {
  if (!Array.isArray(spotNames) || !spotNames.length) {
    return '';
  }

  return spotNames
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join('|');
};

export const getAlertRule = async (userId) => {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return null;
  }

  const { data } = await supabase
    .from('user_alert_rules')
    .select('id, user_id, spot_name, min_rating, max_wind_kts, is_armed')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  return {
    ...data,
    spot_names: parseSpotNames(data.spot_name),
  };
};

export const upsertAlertRule = async ({ userId, spotName, spotNames, minRating, maxWindKts, isArmed }) => {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return { ok: false, error: 'Supabase no configurado' };
  }

  const computedSpotName = serializeSpotNames(spotNames || [spotName || 'Piha']);

  const payload = {
    user_id: userId,
    spot_name: computedSpotName,
    min_rating: minRating,
    max_wind_kts: Number(maxWindKts),
    is_armed: Boolean(isArmed),
  };

  const { error } = await supabase
    .from('user_alert_rules')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
};
