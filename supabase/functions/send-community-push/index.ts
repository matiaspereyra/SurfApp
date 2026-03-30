// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ReportRecord = {
  id: number | string;
  reporter_id: string | null;
  reporter_name: string | null;
  spot_name: string | null;
  comment: string | null;
  user_rating: string | null;
  wind_kts: number | null;
  created_at: string | null;
};

type WebhookPayload = {
  type?: string;
  schema?: string;
  table?: string;
  record?: ReportRecord;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_BATCH = 100;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const toPreviewText = (text: string | null, maxLength = 60) => {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
    if (webhookSecret) {
      const headerSecret = req.headers.get('x-webhook-secret') || '';
      if (headerSecret !== webhookSecret) {
        return jsonResponse({ ok: false, error: 'Unauthorized webhook call' }, 401);
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        500
      );
    }

    const payload = (await req.json()) as WebhookPayload;
    const report = payload?.record;

    if (!report?.id) {
      return jsonResponse({ ok: true, skipped: true, reason: 'Missing report record' });
    }

    const reporterId = report.reporter_id || null;
    if (!reporterId) {
      return jsonResponse({ ok: true, skipped: true, reason: 'Missing reporter_id' });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('token')
      .neq('user_id', reporterId);

    if (tokenError) {
      return jsonResponse({ ok: false, error: tokenError.message }, 500);
    }

    const allTokens = Array.from(
      new Set((tokenRows || []).map((row) => String(row.token || '').trim()).filter(Boolean))
    );

    if (!allTokens.length) {
      return jsonResponse({ ok: true, sent: 0, skipped: true, reason: 'No recipients' });
    }

    const reporterName = (report.reporter_name || 'Surfer').trim();
    const spotName = (report.spot_name || 'Spot').trim();
    const rating = (report.user_rating || '').trim();
    const windKts = typeof report.wind_kts === 'number' ? report.wind_kts : null;
    const bodyPreview = toPreviewText(report.comment);

    const messages = allTokens.map((token) => ({
      to: token,
      title: `${reporterName} reporto en ${spotName}`,
      body: `${bodyPreview}${bodyPreview ? ' • ' : ''}${rating || 'SIN RATING'}${
        windKts !== null ? ` • ${windKts}kts` : ''
      }`,
      data: {
        target: 'community',
        reportId: String(report.id),
        spotName,
        reporter: reporterName,
        userRating: rating || null,
        text: report.comment || '',
        windKts,
      },
      sound: 'default',
      priority: 'high',
    }));

    const batches = chunk(messages, MAX_PER_BATCH);
    const invalidTokens = new Set<string>();
    let sentCount = 0;

    for (const batch of batches) {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
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
      sentCount += batch.length;

      for (let i = 0; i < tickets.length; i += 1) {
        const ticket = tickets[i];
        const originalToken = batch[i]?.to;
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered' && originalToken) {
          invalidTokens.add(originalToken);
        }
      }
    }

    if (invalidTokens.size > 0) {
      await admin.from('push_tokens').delete().in('token', Array.from(invalidTokens));
    }

    return jsonResponse({
      ok: true,
      sent: sentCount,
      recipients: allTokens.length,
      removedInvalidTokens: invalidTokens.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
