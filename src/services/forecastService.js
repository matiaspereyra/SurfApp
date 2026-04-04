import { isSupabaseConfigured, supabase } from '../lib/supabase';

const NZ_TIMEZONE = 'Pacific/Auckland';

const toNzDateKey = (isoDateTime) => {
  if (!isoDateTime) return '';
  const dt = new Date(isoDateTime);
  if (Number.isNaN(dt.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';

  return `${year}-${month}-${day}`;
};

const toWeekDay = (dateKey) => {
  if (!dateKey) return '--';
  const dt = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return '--';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
};

const toOneDecimal = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(1));
};

const toCardinal = (degValue) => {
  const deg = Number(degValue);
  if (!Number.isFinite(deg)) return 'N';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
};

const ratingFromStars = (starCount) => {
  const stars = Number(starCount);
  if (!Number.isFinite(stars)) return 'POOR';
  if (stars <= 1) return 'VERY_POOR';
  if (stars <= 3) return 'POOR';
  if (stars === 4) return 'GOOD';
  return 'EPIC';
};

const toKph = (kts) => {
  const speed = Number(kts);
  if (!Number.isFinite(speed)) return null;
  return Math.round(speed * 1.852);
};

const getRowStars = (surfHeight, swellPeriodS, windKph) => {
  const surf = Number(surfHeight);
  const period = Number(swellPeriodS);
  const wind = Number(windKph);
  if (!Number.isFinite(surf)) return 1;

  let score = 0;
  if (surf >= 0.8) score += 1;
  if (surf >= 1.4) score += 1;

  if (Number.isFinite(period)) {
    if (period >= 9) score += 1;
    if (period >= 12) score += 1;
  }

  if (Number.isFinite(wind)) {
    if (wind <= 18) score += 1;
    if (wind <= 10) score += 1;
  }

  return Math.max(1, Math.min(5, score));
};

const getColorByStarCount = (starCount) => {
  const stars = Number(starCount);
  if (!Number.isFinite(stars)) return '#FFB100';
  if (stars <= 1) return '#DC2626';
  if (stars <= 3) return '#FFB100';
  if (stars === 4) return '#00D15D';
  return '#00A145';
};

const getNzCurrentHour = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NZ_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour : 12;
};

const getNzHourFromIso = (isoDateTime) => {
  if (!isoDateTime) return null;
  const dt = new Date(isoDateTime);
  if (Number.isNaN(dt.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NZ_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour : null;
};

const toLiveHeightLabel = (surfHeightM) => {
  const surf = Number(surfHeightM);
  if (!Number.isFinite(surf)) return '--';
  const min = Math.max(0, surf - 0.2);
  const max = surf + 0.2;
  return `${min.toFixed(1)}-${max.toFixed(1)}m`;
};

const neopreneByTemp = (tempC) => {
  const t = Number(tempC || 0);
  if (t >= 20) return 'None';
  if (t >= 18) return '2/2mm';
  if (t >= 15) return '3/2mm';
  return '4/3mm';
};

const buildTideData = (hourlyRows) => {
  if (!hourlyRows?.length) return [];

  const rows = hourlyRows
    .slice()
    .filter((row) => Number.isFinite(Number(row?.sea_level_height_msl_m)) && row?.forecast_time)
    .sort((a, b) => new Date(a.forecast_time).getTime() - new Date(b.forecast_time).getTime());

  if (!rows.length) return [];

  const rawHeights = rows
    .map((row) => Number(row.sea_level_height_msl_m))
    .filter((value) => Number.isFinite(value));
  const minRawHeight = rawHeights.length ? Math.min(...rawHeights) : 0;
  const heightOffset = minRawHeight < 0 ? Math.abs(minRawHeight) : 0;

  return rows.map((row) => {
    const rawHeight = Number(row.sea_level_height_msl_m);
    const time = new Date(row.forecast_time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: NZ_TIMEZONE,
    });
    const hour = Number(time.slice(0, 2));

    return {
      hour: Number.isFinite(hour) ? hour : 0,
      height: Number((rawHeight + heightOffset).toFixed(3)),
      time,
    };
  });
};

const getNzTodayDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

export const fetchLiveSpotRatings = async (spotNames = []) => {
  if (!isSupabaseConfigured || !supabase || !Array.isArray(spotNames) || !spotNames.length) {
    return {};
  }

  const todayKey = getNzTodayDateKey();
  if (!todayKey) return {};

  const { data: dailyRows, error: dailyError } = await supabase
    .from('spot_forecast_daily')
    .select('spot_name, forecast_date, wave_height_max_m')
    .eq('provider', 'open-meteo')
    .in('spot_name', spotNames)
    .gte('forecast_date', todayKey)
    .order('forecast_date', { ascending: true });

  if (dailyError || !dailyRows?.length) {
    return {};
  }

  const { data: hourlyRows } = await supabase
    .from('spot_forecast_hourly')
    .select('spot_name, forecast_time, wave_height_m, swell_wave_height_m, wave_period_s, swell_wave_period_s, wind_speed_kts')
    .eq('provider', 'open-meteo')
    .in('spot_name', spotNames)
    .gte('forecast_time', `${todayKey}T00:00:00+13:00`)
    .lte('forecast_time', `${todayKey}T23:59:59+13:00`)
    .order('forecast_time', { ascending: true });

  const currentHour = getNzCurrentHour();
  const closestHourlyBySpot = new Map();
  for (const row of hourlyRows || []) {
    const name = row?.spot_name;
    if (!name) continue;

    const hour = getNzHourFromIso(row?.forecast_time);
    if (!Number.isFinite(hour)) continue;
    const distance = Math.abs(hour - currentHour);
    const existing = closestHourlyBySpot.get(name);
    if (!existing || distance < existing.distance) {
      closestHourlyBySpot.set(name, { row, distance });
    }
  }

  const bySpot = {};
  for (const row of dailyRows) {
    const name = row?.spot_name;
    if (!name || bySpot[name]) continue;

    const closestHourly = closestHourlyBySpot.get(name)?.row;
    const surfHeight = closestHourly?.wave_height_m ?? closestHourly?.swell_wave_height_m ?? row?.wave_height_max_m;
    const swellPeriod = closestHourly?.swell_wave_period_s ?? closestHourly?.wave_period_s ?? null;
    const windKph = toKph(closestHourly?.wind_speed_kts);
    const stars = getRowStars(surfHeight, swellPeriod, windKph);
    const markerColor = getColorByStarCount(stars);

    bySpot[name] = {
      rating: ratingFromStars(stars),
      markerColor,
      heightLabel: toLiveHeightLabel(surfHeight),
    };
  }

  return bySpot;
};

export const fetchSpotForecastByName = async (spotName, forecastDays = 16) => {
  if (!isSupabaseConfigured || !supabase || !spotName) {
    return null;
  }

  const { data: dailyRows, error: dailyError } = await supabase
    .from('spot_forecast_daily')
    .select(
      'forecast_date, wave_height_max_m, wave_direction_dominant_deg, wave_period_max_s, wind_wave_height_max_m, wind_wave_direction_dominant_deg, wind_wave_period_max_s, wind_wave_peak_period_max_s, swell_wave_height_max_m, swell_wave_direction_dominant_deg, swell_wave_period_max_s, swell_wave_peak_period_max_s, created_at'
    )
    .eq('provider', 'open-meteo')
    .eq('spot_name', spotName)
    .order('forecast_date', { ascending: true })
    .limit(forecastDays);

  if (dailyError || !dailyRows?.length) {
    return null;
  }

  const startDate = dailyRows[0]?.forecast_date;
  const endDate = dailyRows[dailyRows.length - 1]?.forecast_date;

  // Intentar consulta completa, fallback a columnas básicas si falla
  let hourlyRows = null;
  try {
    const { data, error } = await supabase
      .from('spot_forecast_hourly')
      .select('forecast_time, sea_level_height_msl_m, sea_surface_temperature_c, wave_height_m, wave_direction_deg, wave_period_s, swell_wave_height_m, swell_wave_direction_deg, swell_wave_period_s, wind_speed_kts, wind_gust_kts, wind_direction_deg, wind_wave_direction_deg')
      .eq('provider', 'open-meteo')
      .eq('spot_name', spotName)
      .gte('forecast_time', `${startDate}T00:00:00+13:00`)
      .lte('forecast_time', `${endDate}T23:59:59+13:00`)
      .order('forecast_time', { ascending: true })
      .limit(800);
    if (error) throw error;
    hourlyRows = data || [];
  } catch (_e) {
    // Fallback: consulta simplificada si las columnas no existen
    try {
      const { data } = await supabase
        .from('spot_forecast_hourly')
        .select('forecast_time, sea_level_height_msl_m, sea_surface_temperature_c')
        .eq('provider', 'open-meteo')
        .eq('spot_name', spotName)
        .gte('forecast_time', `${startDate}T00:00:00+13:00`)
        .lte('forecast_time', `${endDate}T23:59:59+13:00`)
        .order('forecast_time', { ascending: true })
        .limit(800);
      hourlyRows = data || [];
    } catch (_e2) {
      hourlyRows = [];
    }
  }

  const hourlyByDay = new Map();
  for (const row of hourlyRows || []) {
    const key = toNzDateKey(row.forecast_time);
    if (!key) continue;
    if (!hourlyByDay.has(key)) {
      hourlyByDay.set(key, []);
    }
    hourlyByDay.get(key).push(row);
  }

  const forecast = dailyRows.map((row) => {
    const dateKey = row.forecast_date;
    const dayHourly = hourlyByDay.get(dateKey) || [];
    const tempSamples = dayHourly
      .map((h) => Number(h.sea_surface_temperature_c))
      .filter((v) => Number.isFinite(v));
    const avgTemp = tempSamples.length
      ? tempSamples.reduce((a, b) => a + b, 0) / tempSamples.length
      : 17;

    const primaryHeight = toOneDecimal(row.swell_wave_height_max_m ?? row.wave_height_max_m ?? 0.8);
    const secondaryHeight = toOneDecimal(Math.max(0.2, primaryHeight * 0.55));
    const maxHeight = toOneDecimal(row.wave_height_max_m ?? primaryHeight);
    const minHeight = toOneDecimal(Math.max(0, maxHeight - 0.6));
    const windSamplesKts = dayHourly
      .map((h) => Number(h.wind_speed_kts))
      .filter((v) => Number.isFinite(v));
    const avgWindKts = windSamplesKts.length
      ? Math.round((windSamplesKts.reduce((a, b) => a + b, 0) / windSamplesKts.length) * 10) / 10
      : null;
    const avgWindKph = toKph(avgWindKts);
    const dayStars = getRowStars(primaryHeight, row.swell_wave_period_max_s || row.wave_period_max_s, avgWindKph);

    return {
      date: dateKey,
      dayOfWeek: toWeekDay(dateKey),
      rating: ratingFromStars(dayStars),
      height: {
        min: minHeight,
        max: maxHeight,
      },
      primarySwell: {
        height: primaryHeight,
        period: Math.round(Number(row.swell_wave_period_max_s || row.wave_period_max_s || 10)),
        direction: toCardinal(row.swell_wave_direction_dominant_deg ?? row.wave_direction_dominant_deg),
      },
      secondarySwell: {
        height: secondaryHeight,
        period: Math.max(5, Math.round(Number(row.swell_wave_period_max_s || row.wave_period_max_s || 8) - 2)),
        direction: toCardinal(row.wave_direction_dominant_deg),
      },
      windSpeed: avgWindKts ?? '--',
      windDirection: toCardinal(row.wind_wave_direction_dominant_deg),
      waterTemp: Math.round(avgTemp),
      tideData: buildTideData(dayHourly),
      neopreneThickness: neopreneByTemp(avgTemp),
      hourlyData: dayHourly.slice(0, 24).map((h) => {
        // Si las columnas horarias no existen, usar datos diarios como fallback
        const surfHeight = h.wave_height_m ?? h.swell_wave_height_m ?? primaryHeight;
        const swellHeight = h.swell_wave_height_m ?? primaryHeight;
        const swellPeriod = h.swell_wave_period_s ?? row.swell_wave_period_max_s ?? 10;
        const swellDir = h.swell_wave_direction_deg ?? row.swell_wave_direction_dominant_deg;
        const windSpeedKts = h.wind_speed_kts;
        const windGustKts = h.wind_gust_kts;
        const windDir = h.wind_direction_deg ?? h.wind_wave_direction_deg ?? row.wind_wave_direction_dominant_deg;
        
        return {
          time: new Date(h.forecast_time).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false, 
            timeZone: NZ_TIMEZONE 
          }),
          surfHeight: toOneDecimal(surfHeight),
          swellHeight: toOneDecimal(swellHeight),
          swellPeriod: Math.round(Number(swellPeriod)),
          swellDirection: toCardinal(swellDir),
          swellDirectionDeg: Number.isFinite(Number(swellDir)) ? Math.round(Number(swellDir)) : null,
          windSpeed: Number.isFinite(Number(windSpeedKts))
            ? Math.round(Number(windSpeedKts) * 10) / 10
            : null,
          windGust: Number.isFinite(Number(windGustKts))
            ? Math.round(Number(windGustKts) * 10) / 10
            : null,
          windDirection: toCardinal(windDir),
          windDirectionDeg: Number.isFinite(Number(windDir)) ? Math.round(Number(windDir)) : null,
          waterTemp: Math.round(Number(h.sea_surface_temperature_c || avgTemp)),
        };
      }).filter(h => h.time !== 'Invalid Date') || [],
    };
  });

  const firstDay = forecast[0];
  const latestCreatedAt = dailyRows[dailyRows.length - 1]?.created_at || null;

  return {
    name: spotName,
    rating: firstDay?.rating || 'FAIR',
    height: firstDay ? `${firstDay.height.min}-${firstDay.height.max}` : '--',
    forecast,
    liveUpdatedAt: latestCreatedAt,
  };
};
