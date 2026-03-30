import { INITIAL_REPORTS } from '../constants/CommunityMock';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const REPORTS_TABLE = 'surf_reports';

const isSameLocalDay = (dateValue) => {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

const isReportFromToday = (report) => {
  if (!report) return false;

  if (report.created_at) {
    return isSameLocalDay(report.created_at);
  }

  if (typeof report.minutesAgo === 'number') {
    return report.minutesAgo < 1440;
  }

  return false;
};

const normalizeReport = (row) => ({
  id: String(row.id),
  reporterId: row.reporter_id || null,
  spotName: row.spot_name,
  reporter: row.reporter_name,
  text: row.comment,
  minutesAgo: Math.max(0, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000)),
  score: row.score,
  windKts: row.wind_kts,
  rating: row.user_rating || row.rating,
  userRating: row.user_rating || row.rating,
  forecastRating: row.forecast_rating || null,
  forecastSnapshot: row.forecast_snapshot || null,
  isForecastAccurate: typeof row.is_forecast_accurate === 'boolean' ? row.is_forecast_accurate : null,
});

export const fetchCommunityReports = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_REPORTS.filter(isReportFromToday);
  }

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select('id, reporter_id, spot_name, reporter_name, comment, score, wind_kts, rating, user_rating, forecast_rating, forecast_snapshot, is_forecast_accurate, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) {
    return INITIAL_REPORTS.filter(isReportFromToday);
  }

  return data
    .filter((row) => isReportFromToday(row))
    .map(normalizeReport);
};

// Fetch reports excluding ones the current user has already viewed
export const fetchCommunityReportsExcludingViewed = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return INITIAL_REPORTS.filter(isReportFromToday);
  }

  const { data, error } = await supabase.rpc('get_community_reports_new', {
    p_limit: 20,
  });

  if (error || !data) {
    return INITIAL_REPORTS.filter(isReportFromToday);
  }

  return data
    .filter((row) => isReportFromToday(row))
    .map(normalizeReport);
};

export const subscribeToCommunityReports = (onReportEvent) => {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('surf_reports_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: REPORTS_TABLE },
      () => {
        onReportEvent?.();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const createCommunityReport = async ({ spotName, comment, windKts, userRating, forecastRating, forecastSnapshot }) => {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, error: 'Supabase no configurado' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, error: 'Usuario no autenticado para insertar reporte' };
  }

  const payload = {
    reporter_id: user.id,
    spot_name: String(spotName || '').trim(),
    reporter_name: String(user.user_metadata?.display_name || user.email?.split('@')?.[0] || 'Surfer').trim(),
    comment: String(comment || '').trim(),
    wind_kts: Math.max(0, Number(windKts || 0)),
    rating: String(userRating || 'FAIR').trim(),
    user_rating: String(userRating || 'FAIR').trim(),
    forecast_rating: forecastRating ? String(forecastRating).trim() : null,
    forecast_snapshot:
      forecastSnapshot && typeof forecastSnapshot === 'object' ? forecastSnapshot : {},
    is_forecast_accurate:
      !!userRating && !!forecastRating
        ? String(userRating).trim().toUpperCase() === String(forecastRating).trim().toUpperCase()
        : null,
  };

  if (!payload.spot_name || !payload.comment) {
    return { ok: false, error: 'spot_name y comment son requeridos por la politica de insert' };
  }

  const rpcResult = await supabase.rpc('publish_spot_report', {
    p_spot_name: payload.spot_name,
    p_comment: payload.comment,
    p_wind_kts: payload.wind_kts,
    p_user_rating: payload.user_rating,
    p_forecast_rating: payload.forecast_rating,
    p_forecast_snapshot: payload.forecast_snapshot,
  });

  if (!rpcResult.error && rpcResult.data) {
    return { ok: true, reportId: rpcResult.data };
  }

  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, reportId: data?.id };
};

export const fetchTopReputation = async () => {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name, trust_points')
    .order('trust_points', { ascending: false })
    .limit(10);

  if (error || !data) {
    return [];
  }

  return data;
};

export const upvoteCommunityReport = async (reportId) => {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true, applied: true };
  }

  const { data, error } = await supabase.rpc('upvote_report_and_reward', {
    target_report_id: Number(reportId),
  });

  if (error) {
    return { ok: false, error };
  }

  return { ok: true, applied: Boolean(data) };
};

export const markReportAsViewed = async (reportId) => {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true };
  }

  const { error } = await supabase.rpc('mark_report_as_viewed', {
    target_report_id: Number(reportId),
  });

  if (error) {
    console.warn('Error marking report as viewed:', error);
    return { ok: false, error };
  }

  return { ok: true };
};
