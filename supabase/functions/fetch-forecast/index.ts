// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SpotInput = {
  name: string;
  lat: number;
  lng: number;
};

type RefreshRequest = {
  spots?: SpotInput[];
  forecast_days?: number;
  timezone?: string;
  source_model?: string;
};

type ForecastSpotRow = {
  name: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
  priority: number;
};

const OPEN_METEO_BASE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const OPEN_METEO_WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const PROVIDER = 'open-meteo';
const DEFAULT_SOURCE_MODEL = 'open-meteo-marine';

const DEFAULT_SPOTS: SpotInput[] = [
  { name: 'Piha', lat: -36.952, lng: 174.468 },
  { name: 'Muriwai', lat: -36.822, lng: 174.425 },
  { name: 'Raglan (Manu Bay)', lat: -37.825, lng: 174.801 },
  { name: 'Mount Maunganui - Main Beach', lat: -37.6402, lng: 176.1845 },
  { name: 'Wainui Beach', lat: -38.645, lng: 177.899 },
  { name: 'Stent Road', lat: -39.318, lng: 174.215 },
  { name: 'Lyall Bay', lat: -41.327, lng: 174.801 },
  { name: 'St Clair', lat: -45.914, lng: 170.48 },
];

const HOURLY_KEYS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'wave_peak_period',
  'wind_wave_height',
  'wind_wave_direction',
  'wind_wave_period',
  'wind_wave_peak_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'swell_wave_peak_period',
  'secondary_swell_wave_height',
  'secondary_swell_wave_direction',
  'secondary_swell_wave_period',
  'tertiary_swell_wave_height',
  'tertiary_swell_wave_direction',
  'tertiary_swell_wave_period',
  'sea_surface_temperature',
  'sea_level_height_msl',
  'ocean_current_velocity',
  'ocean_current_direction',
] as const;

const DAILY_KEYS = [
  'wave_height_max',
  'wave_direction_dominant',
  'wave_period_max',
  'wind_wave_height_max',
  'wind_wave_direction_dominant',
  'wind_wave_period_max',
  'wind_wave_peak_period_max',
  'swell_wave_height_max',
  'swell_wave_direction_dominant',
  'swell_wave_period_max',
  'swell_wave_peak_period_max',
] as const;

const WEATHER_HOURLY_KEYS = [
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
] as const;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const numberOrNull = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toIso = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const loadSpotsFromDatabase = async (admin: ReturnType<typeof createClient>) => {
  const { data, error } = await admin
    .from('forecast_spots')
    .select('name, latitude, longitude, is_active, priority')
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .order('name', { ascending: true });

  if (error || !data?.length) {
    return [];
  }

  return (data as ForecastSpotRow[]).map((row) => ({
    name: row.name,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
  }));
};

const makeOpenMeteoUrl = (spot: SpotInput, forecastDays: number, timezone: string) => {
  const params = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lng),
    hourly: HOURLY_KEYS.join(','),
    daily: DAILY_KEYS.join(','),
    forecast_days: String(forecastDays),
    timezone,
    cell_selection: 'sea',
  });

  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
};

const makeOpenMeteoWeatherUrl = (spot: SpotInput, forecastDays: number, timezone: string) => {
  const params = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lng),
    hourly: WEATHER_HOURLY_KEYS.join(','),
    forecast_days: String(forecastDays),
    timezone,
    wind_speed_unit: 'kn',
  });

  return `${OPEN_METEO_WEATHER_BASE_URL}?${params.toString()}`;
};

const normalizeHourlyRows = (args: {
  runId: number;
  spotName: string;
  sourceModel: string;
  hourly: Record<string, unknown[]>;
  weatherHourly?: Record<string, unknown[]>;
}) => {
  const { runId, spotName, sourceModel, hourly, weatherHourly } = args;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];

  const windByIso = new Map<string, { speedKts: number | null; directionDeg: number | null; gustKts: number | null }>();
  const weatherTimes = Array.isArray(weatherHourly?.time) ? weatherHourly.time : [];
  weatherTimes.forEach((time, idx) => {
    const iso = toIso(time);
    if (!iso) return;
    windByIso.set(iso, {
      speedKts: numberOrNull(weatherHourly?.wind_speed_10m?.[idx]),
      directionDeg: numberOrNull(weatherHourly?.wind_direction_10m?.[idx]),
      gustKts: numberOrNull(weatherHourly?.wind_gusts_10m?.[idx]),
    });
  });

  return times
    .map((time, idx) => {
      const forecastTime = toIso(time);
      if (!forecastTime) return null;
      const windSample = windByIso.get(forecastTime);

      return {
        run_id: runId,
        provider: PROVIDER,
        source_model: sourceModel,
        spot_name: spotName,
        forecast_time: forecastTime,
        wave_height_m: numberOrNull(hourly.wave_height?.[idx]),
        wave_direction_deg: numberOrNull(hourly.wave_direction?.[idx]),
        wave_period_s: numberOrNull(hourly.wave_period?.[idx]),
        wave_peak_period_s: numberOrNull(hourly.wave_peak_period?.[idx]),
        wind_speed_kts: windSample?.speedKts ?? null,
        wind_gust_kts: windSample?.gustKts ?? null,
        wind_direction_deg: windSample?.directionDeg ?? null,
        wind_wave_height_m: numberOrNull(hourly.wind_wave_height?.[idx]),
        wind_wave_direction_deg: numberOrNull(hourly.wind_wave_direction?.[idx]),
        wind_wave_period_s: numberOrNull(hourly.wind_wave_period?.[idx]),
        wind_wave_peak_period_s: numberOrNull(hourly.wind_wave_peak_period?.[idx]),
        swell_wave_height_m: numberOrNull(hourly.swell_wave_height?.[idx]),
        swell_wave_direction_deg: numberOrNull(hourly.swell_wave_direction?.[idx]),
        swell_wave_period_s: numberOrNull(hourly.swell_wave_period?.[idx]),
        swell_wave_peak_period_s: numberOrNull(hourly.swell_wave_peak_period?.[idx]),
        secondary_swell_wave_height_m: numberOrNull(hourly.secondary_swell_wave_height?.[idx]),
        secondary_swell_wave_direction_deg: numberOrNull(hourly.secondary_swell_wave_direction?.[idx]),
        secondary_swell_wave_period_s: numberOrNull(hourly.secondary_swell_wave_period?.[idx]),
        tertiary_swell_wave_height_m: numberOrNull(hourly.tertiary_swell_wave_height?.[idx]),
        tertiary_swell_wave_direction_deg: numberOrNull(hourly.tertiary_swell_wave_direction?.[idx]),
        tertiary_swell_wave_period_s: numberOrNull(hourly.tertiary_swell_wave_period?.[idx]),
        sea_surface_temperature_c: numberOrNull(hourly.sea_surface_temperature?.[idx]),
        sea_level_height_msl_m: numberOrNull(hourly.sea_level_height_msl?.[idx]),
        ocean_current_velocity_kmh: numberOrNull(hourly.ocean_current_velocity?.[idx]),
        ocean_current_direction_deg: numberOrNull(hourly.ocean_current_direction?.[idx]),
        raw: {
          time,
          wave_height: hourly.wave_height?.[idx],
          wave_direction: hourly.wave_direction?.[idx],
          wave_period: hourly.wave_period?.[idx],
          wave_peak_period: hourly.wave_peak_period?.[idx],
          wind_wave_height: hourly.wind_wave_height?.[idx],
          wind_wave_direction: hourly.wind_wave_direction?.[idx],
          wind_wave_period: hourly.wind_wave_period?.[idx],
          wind_wave_peak_period: hourly.wind_wave_peak_period?.[idx],
          swell_wave_height: hourly.swell_wave_height?.[idx],
          swell_wave_direction: hourly.swell_wave_direction?.[idx],
          swell_wave_period: hourly.swell_wave_period?.[idx],
          swell_wave_peak_period: hourly.swell_wave_peak_period?.[idx],
          secondary_swell_wave_height: hourly.secondary_swell_wave_height?.[idx],
          secondary_swell_wave_direction: hourly.secondary_swell_wave_direction?.[idx],
          secondary_swell_wave_period: hourly.secondary_swell_wave_period?.[idx],
          tertiary_swell_wave_height: hourly.tertiary_swell_wave_height?.[idx],
          tertiary_swell_wave_direction: hourly.tertiary_swell_wave_direction?.[idx],
          tertiary_swell_wave_period: hourly.tertiary_swell_wave_period?.[idx],
          sea_surface_temperature: hourly.sea_surface_temperature?.[idx],
          sea_level_height_msl: hourly.sea_level_height_msl?.[idx],
          ocean_current_velocity: hourly.ocean_current_velocity?.[idx],
          ocean_current_direction: hourly.ocean_current_direction?.[idx],
          wind_speed_10m: windSample?.speedKts ?? null,
          wind_gusts_10m: windSample?.gustKts ?? null,
          wind_direction_10m: windSample?.directionDeg ?? null,
        },
      };
    })
    .filter(Boolean);
};

const normalizeDailyRows = (args: {
  runId: number;
  spotName: string;
  sourceModel: string;
  daily: Record<string, unknown[]>;
}) => {
  const { runId, spotName, sourceModel, daily } = args;
  const dates = Array.isArray(daily?.time) ? daily.time : [];

  return dates
    .map((date, idx) => {
      if (!date) return null;

      return {
        run_id: runId,
        provider: PROVIDER,
        source_model: sourceModel,
        spot_name: spotName,
        forecast_date: String(date),
        wave_height_max_m: numberOrNull(daily.wave_height_max?.[idx]),
        wave_direction_dominant_deg: numberOrNull(daily.wave_direction_dominant?.[idx]),
        wave_period_max_s: numberOrNull(daily.wave_period_max?.[idx]),
        wind_wave_height_max_m: numberOrNull(daily.wind_wave_height_max?.[idx]),
        wind_wave_direction_dominant_deg: numberOrNull(daily.wind_wave_direction_dominant?.[idx]),
        wind_wave_period_max_s: numberOrNull(daily.wind_wave_period_max?.[idx]),
        wind_wave_peak_period_max_s: numberOrNull(daily.wind_wave_peak_period_max?.[idx]),
        swell_wave_height_max_m: numberOrNull(daily.swell_wave_height_max?.[idx]),
        swell_wave_direction_dominant_deg: numberOrNull(daily.swell_wave_direction_dominant?.[idx]),
        swell_wave_period_max_s: numberOrNull(daily.swell_wave_period_max?.[idx]),
        swell_wave_peak_period_max_s: numberOrNull(daily.swell_wave_peak_period_max?.[idx]),
        raw: {
          date,
          wave_height_max: daily.wave_height_max?.[idx],
          wave_direction_dominant: daily.wave_direction_dominant?.[idx],
          wave_period_max: daily.wave_period_max?.[idx],
          wind_wave_height_max: daily.wind_wave_height_max?.[idx],
          wind_wave_direction_dominant: daily.wind_wave_direction_dominant?.[idx],
          wind_wave_period_max: daily.wind_wave_period_max?.[idx],
          wind_wave_peak_period_max: daily.wind_wave_peak_period_max?.[idx],
          swell_wave_height_max: daily.swell_wave_height_max?.[idx],
          swell_wave_direction_dominant: daily.swell_wave_direction_dominant?.[idx],
          swell_wave_period_max: daily.swell_wave_period_max?.[idx],
          swell_wave_peak_period_max: daily.swell_wave_peak_period_max?.[idx],
        },
      };
    })
    .filter(Boolean);
};

Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('FORECAST_WEBHOOK_SECRET') || '';
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

    const payload: RefreshRequest = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const forecastDays = Math.max(1, Math.min(16, Number(payload?.forecast_days || 16)));
    const timezone = String(payload?.timezone || 'Pacific/Auckland');
    const sourceModel = String(payload?.source_model || DEFAULT_SOURCE_MODEL);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const dbSpots = await loadSpotsFromDatabase(admin);
    const spots = Array.isArray(payload?.spots) && payload.spots.length
      ? payload.spots
      : dbSpots.length
        ? dbSpots
        : DEFAULT_SPOTS;

    const { data: runRow, error: runError } = await admin
      .from('forecast_runs')
      .insert({
        provider: PROVIDER,
        status: 'running',
        requested_spots: spots.length,
        metadata: {
          forecast_days: forecastDays,
          timezone,
          source_model: sourceModel,
        },
      })
      .select('id')
      .single();

    if (runError || !runRow?.id) {
      return jsonResponse({ ok: false, error: runError?.message || 'Unable to create forecast run' }, 500);
    }

    const runId = runRow.id as number;
    let successfulSpots = 0;
    let failedSpots = 0;
    const failures: Array<{ spot: string; error: string }> = [];

    for (const spot of spots) {
      try {
        const marineUrl = makeOpenMeteoUrl(spot, forecastDays, timezone);
        const response = await fetch(marineUrl, { method: 'GET' });

        if (!response.ok) {
          failedSpots += 1;
          failures.push({ spot: spot.name, error: `Open-Meteo ${response.status}` });
          continue;
        }

        const data = await response.json();
        let weatherHourly = {};
        try {
          const weatherUrl = makeOpenMeteoWeatherUrl(spot, forecastDays, timezone);
          const weatherResponse = await fetch(weatherUrl, { method: 'GET' });
          if (weatherResponse.ok) {
            const weatherData = await weatherResponse.json();
            weatherHourly = weatherData?.hourly || {};
          }
        } catch (_windError) {
          weatherHourly = {};
        }
        const generatedAt = new Date().toISOString();

        const { error: rawError } = await admin.from('spot_forecast_raw').insert({
          run_id: runId,
          provider: PROVIDER,
          source_model: sourceModel,
          spot_name: spot.name,
          latitude: data?.latitude ?? spot.lat,
          longitude: data?.longitude ?? spot.lng,
          timezone: data?.timezone || timezone,
          generated_at: generatedAt,
          payload: data,
        });

        if (rawError) {
          failedSpots += 1;
          failures.push({ spot: spot.name, error: rawError.message });
          continue;
        }

        const hourlyRows = normalizeHourlyRows({
          runId,
          spotName: spot.name,
          sourceModel,
          hourly: data?.hourly || {},
          weatherHourly,
        });

        for (const batch of chunk(hourlyRows, 500)) {
          const { error } = await admin
            .from('spot_forecast_hourly')
            .upsert(batch, { onConflict: 'provider,spot_name,source_model,forecast_time' });

          if (error) {
            throw error;
          }
        }

        const dailyRows = normalizeDailyRows({
          runId,
          spotName: spot.name,
          sourceModel,
          daily: data?.daily || {},
        });

        for (const batch of chunk(dailyRows, 200)) {
          const { error } = await admin
            .from('spot_forecast_daily')
            .upsert(batch, { onConflict: 'provider,spot_name,source_model,forecast_date' });

          if (error) {
            throw error;
          }
        }

        successfulSpots += 1;
      } catch (spotError) {
        failedSpots += 1;
        failures.push({
          spot: spot.name,
          error: spotError instanceof Error ? spotError.message : 'Unknown spot error',
        });
      }
    }

    const status = successfulSpots > 0 ? 'completed' : 'failed';
    const errorMessage = failures.length ? failures.slice(0, 3).map((f) => `${f.spot}: ${f.error}`).join(' | ') : null;

    await admin
      .from('forecast_runs')
      .update({
        status,
        successful_spots: successfulSpots,
        failed_spots: failedSpots,
        error_message: errorMessage,
        metadata: {
          forecast_days: forecastDays,
          timezone,
          source_model: sourceModel,
          failures,
        },
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return jsonResponse({
      ok: true,
      runId,
      status,
      requestedSpots: spots.length,
      successfulSpots,
      failedSpots,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
