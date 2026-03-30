import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const ensureUserProfile = async (user) => {
  if (!isSupabaseConfigured || !supabase || !user?.id) {
    return null;
  }

  const existingProfile = await getUserProfile(user.id);
  if (existingProfile) {
    return existingProfile;
  }

  const defaultName =
    user.user_metadata?.display_name ||
    user.email?.split('@')?.[0] ||
    'Surfer';

  const { error } = await supabase.from('user_profiles').upsert(
    {
      id: user.id,
      email: user.email,
      display_name: defaultName,
      home_city: user.user_metadata?.home_city || 'Auckland',
    },
    { onConflict: 'id' }
  );

  if (error) {
    return null;
  }

  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, home_city, trust_points')
    .eq('id', user.id)
    .maybeSingle();

  return data || null;
};

export const getUserProfile = async (userId) => {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return null;
  }

  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, home_city, trust_points')
    .eq('id', userId)
    .maybeSingle();

  return data || null;
};

export const updateUserProfile = async ({ userId, displayName, homeCity }) => {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return { ok: false, error: 'Supabase no configurado' };
  }

  const { error } = await supabase.from('user_profiles').upsert(
    {
      id: userId,
      display_name: displayName,
      home_city: homeCity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  const profile = await getUserProfile(userId);
  if (!profile) {
    return { ok: false, error: 'No se pudo confirmar el perfil actualizado' };
  }

  return { ok: true, profile };
};
