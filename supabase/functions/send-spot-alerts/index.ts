// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_BATCH = 100;
const NZ_TIMEZONE = 'Pacific/Auckland';
const GOOD_RATINGS = new Set(['GOOD', 'EPIC']);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const parseSpotNames = (spotNameRaw: string | null) =>
  String(spotNameRaw || '')
    .split('|')
    .map((name) => name.trim())
    .filter(Boolean);

const toNzDateKey = (dateValue: Date | string | number) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

const toRating = (waveHeightMaxM: unknown) => {
  const value = Number(waveHeightMaxM || 0);
  if (value >= 2.8) return 'EPIC';
  if (value >= 2.1) return 'GOOD';
  if (value >= 1.3) return 'FAIR';
  return 'POOR';
};

const ratingToRank = (rating: string | null) => {
  const normalized = String(rating || '').trim().toUpperCase();
  if (normalized === 'EPIC') return 3;
  if (normalized === 'GOOD') return 2;
  if (normalized === 'FAIR') return 1;
  return 0;
};

const getSettingNumber = (settingsMap: Map<string, string>, key: string, fallback: number) => {
  const parsed = Number(settingsMap.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
};

Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('SPOT_ALERT_WEBHOOK_SECRET') || '';
    if (webhookSecret) {
      const headerSecret = req.headers.get('x-webhook-secret') || '';
      if (headerSecret !== webhookSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized webhook call' }, 401);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: settingsRows } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ['spot_alert_cooldown_hours', 'spot_alert_daily_limit', 'spot_alert_admin_threshold_per_run']);

    const settings = new Map<string, string>();
    for (const row of settingsRows || []) {
      settings.set(String(row.key), String(row.value || ''));
    }

    const cooldownHours = Math.max(1, getSettingNumber(settings, 'spot_alert_cooldown_hours', 8));
    const dailyLimit = Math.max(1, getSettingNumber(settings, 'spot_alert_daily_limit', 3));
    const adminThreshold = Math.max(1, getSettingNumber(settings, 'spot_alert_admin_threshold_per_run', 40));

    const now = new Date();
    const todayNz = toNzDateKey(now);

    const { data: ruleRows, error: ruleError } = await admin
      .from('user_alert_rules')
      .select('user_id, spot_name, min_rating, is_armed')
      .eq('is_armed', true);

    if (ruleError) {
      return jsonResponse({ ok: false, error: ruleError.message }, 500);
    }

    if (!ruleRows?.length) {
      return jsonResponse({ ok: true, skipped: true, reason: 'No armed rules' });
    }

    const spotToUsers = new Map<string, Array<{ userId: string; minRating: string }>>();
    const userIds = new Set<string>();

    for (const row of ruleRows) {
      const userId = String(row.user_id || '').trim();
      if (!userId) continue;

      const minRating = String(row.min_rating || 'GOOD').trim().toUpperCase();
      const spots = parseSpotNames(row.spot_name);
      if (!spots.length) continue;

      userIds.add(userId);

      for (const spotName of spots) {
        if (!spotToUsers.has(spotName)) {
          spotToUsers.set(spotName, []);
        }
        spotToUsers.get(spotName)?.push({ userId, minRating });
      }
    }

    const spotNames = Array.from(spotToUsers.keys());
    if (!spotNames.length) {
      return jsonResponse({ ok: true, skipped: true, reason: 'No configured spots' });
    }

    const { data: dailyRows, error: dailyError } = await admin
      .from('spot_forecast_daily')
      .select('spot_name, forecast_date, wave_height_max_m, created_at, source_model, run_id')
      .eq('provider', 'open-meteo')
      .eq('forecast_date', todayNz)
      .in('spot_name', spotNames)
      .order('created_at', { ascending: false });

    if (dailyError) {
      return jsonResponse({ ok: false, error: dailyError.message }, 500);
    }

    const latestDailyBySpot = new Map<string, any>();
    for (const row of dailyRows || []) {
      const name = String(row.spot_name || '').trim();
      if (!name || latestDailyBySpot.has(name)) continue;
      latestDailyBySpot.set(name, row);
    }

    if (!latestDailyBySpot.size) {
      return jsonResponse({ ok: true, skipped: true, reason: 'No daily forecast for today' });
    }

    const sinceIso = new Date(now.getTime() - Math.max(cooldownHours, 24) * 60 * 60 * 1000).toISOString();
    const { data: recentEvents } = await admin
      .from('alert_push_events')
      .select('user_id, spot_name, rating, forecast_date, sent_at')
      .gte('sent_at', sinceIso);

    const recentEventRows = recentEvents || [];

    const latestByUserSpot = new Map<string, number>();
    const alreadySentToday = new Set<string>();
    const dailyCountByUser = new Map<string, number>();

    for (const row of recentEventRows) {
      const userId = String(row.user_id || '').trim();
      const spotName = String(row.spot_name || '').trim();
      const rating = String(row.rating || '').trim().toUpperCase();
      const sentAtMs = new Date(row.sent_at).getTime();
      if (!userId || !spotName || Number.isNaN(sentAtMs)) continue;

      const userSpotKey = `${userId}::${spotName}`;
      const currentLatest = latestByUserSpot.get(userSpotKey) || 0;
      if (sentAtMs > currentLatest) {
        latestByUserSpot.set(userSpotKey, sentAtMs);
      }

      const eventNzDay = toNzDateKey(row.sent_at);
      if (eventNzDay === todayNz) {
        const currentCount = dailyCountByUser.get(userId) || 0;
        dailyCountByUser.set(userId, currentCount + 1);
        alreadySentToday.add(`${userId}::${spotName}::${todayNz}::${rating}`);
      }
    }

    const pendingAlerts: Array<{
      userId: string;
      spotName: string;
      rating: string;
      forecastDate: string;
      sourceModel: string | null;
      runId: number | null;
      waveHeightMaxM: number;
    }> = [];

    let skippedByRating = 0;
    let skippedByCooldown = 0;
    let skippedByDailyLimit = 0;
    let skippedAlreadySent = 0;

    for (const [spotName, targetUsers] of spotToUsers.entries()) {
      const daily = latestDailyBySpot.get(spotName);
      if (!daily) continue;

      const rating = toRating(daily.wave_height_max_m);
      if (!GOOD_RATINGS.has(rating)) {
        skippedByRating += targetUsers.length;
        continue;
      }

      for (const target of targetUsers) {
        const minRank = ratingToRank(target.minRating);
        const currentRank = ratingToRank(rating);
        if (currentRank < minRank) {
          skippedByRating += 1;
          continue;
        }

        const dedupeKey = `${target.userId}::${spotName}::${todayNz}::${rating}`;
        if (alreadySentToday.has(dedupeKey)) {
          skippedAlreadySent += 1;
          continue;
        }

        const dailyCount = dailyCountByUser.get(target.userId) || 0;
        if (dailyCount >= dailyLimit) {
          skippedByDailyLimit += 1;
          continue;
        }

        const userSpotKey = `${target.userId}::${spotName}`;
        const lastSentMs = latestByUserSpot.get(userSpotKey) || 0;
        const hoursSinceLast = (now.getTime() - lastSentMs) / (1000 * 60 * 60);
        if (lastSentMs > 0 && hoursSinceLast < cooldownHours) {
          skippedByCooldown += 1;
          continue;
        }

        pendingAlerts.push({
          userId: target.userId,
          spotName,
          rating,
          forecastDate: todayNz,
          sourceModel: daily.source_model || null,
          runId: Number.isFinite(Number(daily.run_id)) ? Number(daily.run_id) : null,
          waveHeightMaxM: Number(daily.wave_height_max_m || 0),
        });
      }
    }

    if (!pendingAlerts.length) {
      if (skippedByDailyLimit >= adminThreshold) {
        await admin.from('alert_push_admin_events').insert({
          event_type: 'daily_limit_block_volume',
          severity: 'warning',
          title: 'High volume of blocked push alerts',
          details: `Blocked ${skippedByDailyLimit} alerts by daily limit`,
          metadata: {
            skippedByDailyLimit,
            skippedByCooldown,
            skippedAlreadySent,
            skippedByRating,
            todayNz,
            cooldownHours,
            dailyLimit,
          },
        });
      }

      return jsonResponse({
        ok: true,
        sent: 0,
        skipped: true,
        reason: 'No alerts after filters',
        skippedByRating,
        skippedByCooldown,
        skippedByDailyLimit,
        skippedAlreadySent,
      });
    }

    const uniqueUserIds = Array.from(new Set(pendingAlerts.map((item) => item.userId)));
    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('user_id, token, updated_at')
      .in('user_id', uniqueUserIds)
      .order('updated_at', { ascending: false });

    if (tokenError) {
      return jsonResponse({ ok: false, error: tokenError.message }, 500);
    }

    const latestTokenByUser = new Map<string, string>();
    for (const row of tokenRows || []) {
      const userId = String(row.user_id || '').trim();
      const token = String(row.token || '').trim();
      if (!userId || !token || latestTokenByUser.has(userId)) continue;
      latestTokenByUser.set(userId, token);
    }

    const deliveries = pendingAlerts
      .map((alert) => {
        const token = latestTokenByUser.get(alert.userId);
        if (!token) return null;

        return {
          alert,
          message: {
            to: token,
            title: `${alert.spotName} esta ${alert.rating}`,
            body: `Condiciones ${alert.rating}. Altura max ${alert.waveHeightMaxM.toFixed(1)}m.`,
            data: {
              target: 'forecast',
              spotName: alert.spotName,
              rating: alert.rating,
              forecastDate: alert.forecastDate,
              source: 'spot-alert',
            },
            sound: 'default',
            priority: 'high',
          },
        };
      })
      .filter(Boolean);

    if (!deliveries.length) {
      return jsonResponse({ ok: true, sent: 0, skipped: true, reason: 'No recipients with valid token' });
    }

    const invalidTokens = new Set<string>();
    const successfulEvents: any[] = [];

    for (const batch of chunk(deliveries, MAX_PER_BATCH)) {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch.map((item) => item.message)),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        return jsonResponse(
          {
            ok: false,
            error: `Expo push request failed: ${resp.status}`,
            details: errorText,
          },
          502
        );
      }

      const result = await resp.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];

      for (let i = 0; i < batch.length; i += 1) {
        const item = batch[i];
        const ticket = tickets[i];

        if (ticket?.status === 'ok') {
          successfulEvents.push({
            user_id: item.alert.userId,
            spot_name: item.alert.spotName,
            rating: item.alert.rating,
            forecast_date: item.alert.forecastDate,
            provider: 'open-meteo',
            source_model: item.alert.sourceModel,
            run_id: item.alert.runId,
            message_payload: {
              title: item.message.title,
              body: item.message.body,
              data: item.message.data,
              ticket,
            },
          });
          continue;
        }

        const ticketError = ticket?.details?.error;
        if (ticket?.status === 'error' && ticketError === 'DeviceNotRegistered') {
          invalidTokens.add(item.message.to);
        }
      }
    }

    if (invalidTokens.size > 0) {
      await admin.from('push_tokens').delete().in('token', Array.from(invalidTokens));
    }

    if (successfulEvents.length > 0) {
      await admin
        .from('alert_push_events')
        .insert(successfulEvents)
        .select('id');
    }

    if (skippedByDailyLimit >= adminThreshold) {
      await admin.from('alert_push_admin_events').insert({
        event_type: 'daily_limit_block_volume',
        severity: 'warning',
        title: 'High volume of blocked push alerts',
        details: `Blocked ${skippedByDailyLimit} alerts by daily limit`,
        metadata: {
          skippedByDailyLimit,
          skippedByCooldown,
          skippedAlreadySent,
          skippedByRating,
          todayNz,
          cooldownHours,
          dailyLimit,
        },
      });
    }

    return jsonResponse({
      ok: true,
      sent: successfulEvents.length,
      attempted: deliveries.length,
      skippedByRating,
      skippedByCooldown,
      skippedByDailyLimit,
      skippedAlreadySent,
      removedInvalidTokens: invalidTokens.size,
      cooldownHours,
      dailyLimit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
