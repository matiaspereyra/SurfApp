import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const isAuthAvailable = isSupabaseConfigured && Boolean(supabase);

const isDeletedUserAuthError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('user from sub claim in jwt does not exist') ||
    message.includes('user does not exist') ||
    message.includes('user not found')
  );
};

export const sendOtpCode = async (email) => {
  if (!isAuthAvailable) {
    return { ok: false, error: 'Supabase no configurado' };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
};

export const verifyOtpCode = async ({ email, token }) => {
  if (!isAuthAvailable) {
    return { ok: false, error: 'Supabase no configurado' };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, session: data.session, user: data.user };
};

export const getCurrentUser = async () => {
  if (!isAuthAvailable) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error && isDeletedUserAuthError(error)) {
    await supabase.auth.signOut();
    return null;
  }

  return data?.user || null;
};

export const getCurrentSession = async () => {
  if (!isAuthAvailable) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data?.session || null;
};

export const onAuthStateChange = (callback) => {
  if (!isAuthAvailable) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      callback(null);
      return;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error && isDeletedUserAuthError(error)) {
      await supabase.auth.signOut();
      callback(null);
      return;
    }

    callback(data?.user || session.user || null);
  });

  return () => subscription.unsubscribe();
};

export const signOutUser = async () => {
  if (!isAuthAvailable) {
    return;
  }

  await supabase.auth.signOut();
};
