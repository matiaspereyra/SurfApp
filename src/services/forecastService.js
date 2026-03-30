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
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return directions[index];
};

const deriveRating = (waveHeightM) => {
  const h = Number(waveHeightM || 0);
  if (h >= 2.8) return 'EPIC';
  if (h >= 2.1) return 'GOOD';
  if (h >= 1.3) return 'FAIR';
  if (h >= 0.7) return 'POOR';
  return 'VERY_POOR';
};

const neopreneByTemp = (tempC) => {
  const t = Number(tempC || 0);
  if (t >= 20) return 'None';
  if (t >= 18) return '2/2mm';
  if (t >= 15) return '3/2mm';
  return '4/3mm';
};

const buildTideData = (hourlyRows) => {
  if (!hourlyRows?.length) {
    return [
      { hour: 0, height: 1, time: '00:00' },
      { hour: 2, height: 1.1, time: '02:00' },
      { hour: 4, height: 1.2, time: '04:00' },
      { hour: 6, height: 1.3, time: '06:00' },
      { hour: 8, height: 1.2, time: '08:00' },
      { hour: 10, height: 1.1, time: '10:00' },
      { hour: 12, height: 1.0, time: '12:00' },
      { hour: 14, height: 1.1, time: '14:00' },
      { hour: 16, height: 1.2, time: '16:00' },
      { hour: 18, height: 1.3, time: '18:00' },
      { hour: 20, height: 1.2, time: '20:00' },
      { hour: 22, height: 1.1, time: '22:00' },
    ];
  }

  const rows = hourlyRows
    .slice()
    .sort((a, b) => new Date(a.forecast_time).getTime() - new Date(b.forecast_time).getTime())
    .filter((_row, idx) => idx % 2 === 0)
    .slice(0, 12);

  return rows.map((row) => {
    const dt = new Date(row.forecast_time);
    const hour = dt.getHours();
    return {
      hour,
      height: toOneDecimal(row.sea_level_height_msl_m ?? 1),
      time: `${String(hour).padStart(2, '0')}:00`,
    };
  });
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

  const { data: hourlyRows } = await supabase
    .from('spot_forecast_hourly')
    .select('forecast_time, sea_level_height_msl_m, sea_surface_temperature_c')
    .eq('provider', 'open-meteo')
    .eq('spot_name', spotName)
    .gte('forecast_time', `${startDate}T00:00:00+13:00`)
    .lte('forecast_time', `${endDate}T23:59:59+13:00`)
    .order('forecast_time', { ascending: true })
    .limit(800);

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

    return {
      date: dateKey,
      dayOfWeek: toWeekDay(dateKey),
      rating: deriveRating(maxHeight),
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
      windSpeed: 0,
      windDirection: toCardinal(row.wind_wave_direction_dominant_deg),
      waterTemp: Math.round(avgTemp),
      tideData: buildTideData(dayHourly),
      neopreneThickness: neopreneByTemp(avgTemp),
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
