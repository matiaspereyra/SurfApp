alter table if exists public.spot_forecast_hourly
  add column if not exists wind_gust_kts double precision;
