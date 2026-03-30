-- Forecast ingestion and storage (raw + normalized)
create table if not exists public.forecast_runs (
  id bigint generated always as identity primary key,
  provider text not null default 'open-meteo',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  requested_spots integer not null default 0,
  successful_spots integer not null default 0,
  failed_spots integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_forecast_runs_provider_started_at
  on public.forecast_runs (provider, started_at desc);

create table if not exists public.spot_forecast_raw (
  id bigint generated always as identity primary key,
  run_id bigint references public.forecast_runs(id) on delete set null,
  provider text not null default 'open-meteo',
  source_model text,
  spot_name text not null,
  latitude double precision,
  longitude double precision,
  timezone text,
  generated_at timestamptz,
  fetched_at timestamptz not null default now(),
  payload jsonb not null,
  payload_hash text,
  unique (provider, spot_name, source_model, generated_at)
);

create index if not exists idx_spot_forecast_raw_spot_fetched
  on public.spot_forecast_raw (spot_name, fetched_at desc);

create index if not exists idx_spot_forecast_raw_payload_gin
  on public.spot_forecast_raw using gin (payload);

create table if not exists public.spot_forecast_hourly (
  id bigint generated always as identity primary key,
  run_id bigint references public.forecast_runs(id) on delete set null,
  provider text not null default 'open-meteo',
  source_model text,
  spot_name text not null,
  forecast_time timestamptz not null,

  -- core wave and wind metrics
  wave_height_m double precision,
  wave_direction_deg double precision,
  wave_period_s double precision,
  wave_peak_period_s double precision,
  wind_speed_kts double precision,
  wind_direction_deg double precision,

  -- swell and wind-wave components
  wind_wave_height_m double precision,
  wind_wave_direction_deg double precision,
  wind_wave_period_s double precision,
  wind_wave_peak_period_s double precision,
  swell_wave_height_m double precision,
  swell_wave_direction_deg double precision,
  swell_wave_period_s double precision,
  swell_wave_peak_period_s double precision,
  secondary_swell_wave_height_m double precision,
  secondary_swell_wave_direction_deg double precision,
  secondary_swell_wave_period_s double precision,
  tertiary_swell_wave_height_m double precision,
  tertiary_swell_wave_direction_deg double precision,
  tertiary_swell_wave_period_s double precision,

  -- ocean conditions
  sea_surface_temperature_c double precision,
  sea_level_height_msl_m double precision,
  ocean_current_velocity_kmh double precision,
  ocean_current_direction_deg double precision,

  -- keep a complete source snapshot to preserve all provider fields
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (provider, spot_name, source_model, forecast_time)
);

create index if not exists idx_spot_forecast_hourly_spot_time
  on public.spot_forecast_hourly (spot_name, forecast_time);

create index if not exists idx_spot_forecast_hourly_run
  on public.spot_forecast_hourly (run_id);

create index if not exists idx_spot_forecast_hourly_raw_gin
  on public.spot_forecast_hourly using gin (raw);

create table if not exists public.spot_forecast_daily (
  id bigint generated always as identity primary key,
  run_id bigint references public.forecast_runs(id) on delete set null,
  provider text not null default 'open-meteo',
  source_model text,
  spot_name text not null,
  forecast_date date not null,

  wave_height_max_m double precision,
  wave_direction_dominant_deg double precision,
  wave_period_max_s double precision,
  wind_wave_height_max_m double precision,
  wind_wave_direction_dominant_deg double precision,
  wind_wave_period_max_s double precision,
  wind_wave_peak_period_max_s double precision,
  swell_wave_height_max_m double precision,
  swell_wave_direction_dominant_deg double precision,
  swell_wave_period_max_s double precision,
  swell_wave_peak_period_max_s double precision,

  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  unique (provider, spot_name, source_model, forecast_date)
);

create index if not exists idx_spot_forecast_daily_spot_date
  on public.spot_forecast_daily (spot_name, forecast_date);

create index if not exists idx_spot_forecast_daily_run
  on public.spot_forecast_daily (run_id);

create index if not exists idx_spot_forecast_daily_raw_gin
  on public.spot_forecast_daily using gin (raw);

create or replace view public.latest_forecast_run as
select *
from public.forecast_runs
where status = 'completed'
order by started_at desc
limit 1;

-- helper view to read the most recent hourly point per spot
create or replace view public.latest_spot_forecast_hourly as
select distinct on (spot_name, forecast_time)
  spot_name,
  forecast_time,
  provider,
  source_model,
  wave_height_m,
  wave_direction_deg,
  wave_period_s,
  wave_peak_period_s,
  wind_speed_kts,
  wind_direction_deg,
  sea_surface_temperature_c,
  raw,
  created_at
from public.spot_forecast_hourly
order by spot_name, forecast_time, created_at desc;

-- keep only recent history to control storage growth
create or replace function public.prune_old_forecast_data(retention_days integer default 14)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.spot_forecast_hourly
  where forecast_time < (now() - make_interval(days => retention_days));

  delete from public.spot_forecast_daily
  where forecast_date < ((now() - make_interval(days => retention_days))::date);

  delete from public.spot_forecast_raw
  where fetched_at < (now() - make_interval(days => retention_days));

  delete from public.forecast_runs
  where started_at < (now() - make_interval(days => retention_days));
end;
$$;

grant execute on function public.prune_old_forecast_data(integer) to service_role;

-- RLS for forecast tables (public read; writes expected from service role ingestion)
alter table public.forecast_runs enable row level security;
alter table public.spot_forecast_raw enable row level security;
alter table public.spot_forecast_hourly enable row level security;
alter table public.spot_forecast_daily enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'forecast_runs' and policyname = 'forecast_runs_select_all'
  ) then
    create policy forecast_runs_select_all on public.forecast_runs
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'spot_forecast_raw' and policyname = 'spot_forecast_raw_select_all'
  ) then
    create policy spot_forecast_raw_select_all on public.spot_forecast_raw
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'spot_forecast_hourly' and policyname = 'spot_forecast_hourly_select_all'
  ) then
    create policy spot_forecast_hourly_select_all on public.spot_forecast_hourly
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'spot_forecast_daily' and policyname = 'spot_forecast_daily_select_all'
  ) then
    create policy spot_forecast_daily_select_all on public.spot_forecast_daily
      for select using (true);
  end if;
end $$;
