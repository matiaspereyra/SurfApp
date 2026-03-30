-- Enable extension for UUIDs if needed
create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- User profiles linked to auth users
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Surfer',
  home_city text not null default 'Auckland',
  trust_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_trust_points on public.user_profiles (trust_points desc);

create table if not exists public.user_alert_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  spot_name text not null default 'Piha',
  min_rating text not null default 'EPIC',
  max_wind_kts integer not null default 10,
  is_armed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_alert_rules_user_id on public.user_alert_rules (user_id);

-- Push notification tokens for Expo
create table if not exists public.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_push_tokens_user_token on public.push_tokens (user_id, token);
create index if not exists idx_push_tokens_user_id on public.push_tokens (user_id);

-- Core table for community reports
create table if not exists public.surf_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  spot_name text not null,
  reporter_name text not null,
  comment text not null,
  score integer not null default 0,
  wind_kts integer not null default 0,
  rating text not null,
  created_at timestamptz not null default now()
);

alter table public.surf_reports
  add column if not exists user_rating text,
  add column if not exists forecast_rating text,
  add column if not exists forecast_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists is_forecast_accurate boolean;

create index if not exists idx_surf_reports_created_at on public.surf_reports (created_at desc);
create index if not exists idx_surf_reports_spot_name on public.surf_reports (spot_name);
create index if not exists idx_surf_reports_reporter_id on public.surf_reports (reporter_id);

-- One vote per user per report
create table if not exists public.surf_report_votes (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.surf_reports(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_surf_report_votes_unique
  on public.surf_report_votes (report_id, voter_id);

-- Track which reports a user has viewed/seen
create table if not exists public.report_views (
  id bigint generated always as identity primary key,
  report_id bigint not null references public.surf_reports(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_report_views_unique
  on public.report_views (report_id, viewer_id);

-- RPC used by the app to upvote a report atomically
create or replace function public.increment_report_score(target_report_id bigint)
returns void
language plpgsql
security definer
as $$
begin
  update public.surf_reports
  set score = score + 1
  where id = target_report_id;
end;
$$;

-- Publish report using current authenticated user
drop function if exists public.publish_spot_report(text, text, integer, text);

create or replace function public.publish_spot_report(
  p_spot_name text,
  p_comment text,
  p_wind_kts integer,
  p_user_rating text,
  p_forecast_rating text default null,
  p_forecast_snapshot jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_display_name text;
  v_report_id bigint;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select display_name
  into v_display_name
  from public.user_profiles
  where id = v_user_id;

  if v_display_name is null then
    v_display_name := 'Surfer';
  end if;

  insert into public.surf_reports (
    reporter_id,
    spot_name,
    reporter_name,
    comment,
    wind_kts,
    rating,
    user_rating,
    forecast_rating,
    forecast_snapshot,
    is_forecast_accurate
  ) values (
    v_user_id,
    p_spot_name,
    v_display_name,
    p_comment,
    greatest(0, p_wind_kts),
    p_user_rating,
    p_user_rating,
    p_forecast_rating,
    coalesce(p_forecast_snapshot, '{}'::jsonb),
    case
      when p_forecast_rating is null then null
      else upper(trim(p_user_rating)) = upper(trim(p_forecast_rating))
    end
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- Upvote + reward trust points to report owner
drop function if exists public.upvote_report_and_reward(bigint);

create or replace function public.upvote_report_and_reward(target_report_id bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  v_voter uuid;
  v_vote_id bigint;
  v_owner uuid;
begin
  v_voter := auth.uid();
  if v_voter is null then
    raise exception 'Not authenticated';
  end if;

  select reporter_id
  into v_owner
  from public.surf_reports
  where id = target_report_id;

  if v_owner is not null and v_owner = v_voter then
    return false;
  end if;

  insert into public.surf_report_votes (report_id, voter_id)
  values (target_report_id, v_voter)
  on conflict (report_id, voter_id) do nothing
  returning id into v_vote_id;

  if v_vote_id is null then
    return false;
  end if;

  update public.surf_reports
  set score = score + 1
  where id = target_report_id
  returning reporter_id into v_owner;

  if v_owner is not null then
    update public.user_profiles
    set trust_points = trust_points + 5,
        updated_at = now()
    where id = v_owner;
  end if;

  return true;
end;
$$;

grant execute on function public.publish_spot_report(text, text, integer, text, text, jsonb) to authenticated;
grant execute on function public.upvote_report_and_reward(bigint) to authenticated;
grant execute on function public.increment_report_score(bigint) to authenticated;

-- Mark a report as viewed by current user
create or replace function public.mark_report_as_viewed(target_report_id bigint)
returns void
language plpgsql
security definer
as $$
declare
  v_viewer_id uuid;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.report_views (report_id, viewer_id)
  values (target_report_id, v_viewer_id)
  on conflict (report_id, viewer_id) do nothing;
end;
$$;

-- Get community reports excluding already viewed ones
create or replace function public.get_community_reports_new(
  p_limit integer default 20
)
returns table (
  id bigint,
  reporter_id uuid,
  spot_name text,
  reporter_name text,
  comment text,
  score integer,
  wind_kts integer,
  rating text,
  user_rating text,
  forecast_rating text,
  forecast_snapshot jsonb,
  is_forecast_accurate boolean,
  created_at timestamptz
) as $$
declare
  v_viewer_id uuid;
begin
  v_viewer_id := auth.uid();

  return query
  select r.id, r.reporter_id, r.spot_name, r.reporter_name, r.comment,
         r.score, r.wind_kts, r.rating, r.user_rating, r.forecast_rating,
         r.forecast_snapshot, r.is_forecast_accurate, r.created_at
  from public.surf_reports r
  where v_viewer_id is null 
     or not exists (
       select 1 from public.report_views rv
       where rv.report_id = r.id and rv.viewer_id = v_viewer_id
     )
  order by r.created_at desc
  limit p_limit;
end;
$$ language plpgsql security definer;

grant execute on function public.get_community_reports_new(integer) to authenticated;
grant execute on function public.mark_report_as_viewed(bigint) to authenticated;

-- Save or update push notification token
create or replace function public.save_push_token(p_token text)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_token = '' or p_token is null then
    return;
  end if;

  insert into public.push_tokens (user_id, token)
  values (v_user_id, p_token)
  on conflict (user_id, token) do update
  set updated_at = now();
end;
$$;

grant execute on function public.save_push_token(text) to authenticated;

-- Trigger remote push delivery through Supabase Edge Function
-- Configuration table used by notify_new_report_push.
-- This avoids ALTER DATABASE permissions that are restricted on hosted Supabase.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('push_function_url', '')
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('push_webhook_secret', '')
on conflict (key) do nothing;

create or replace function public.get_app_setting(p_key text)
returns text
language sql
stable
as $$
  select nullif(value, '')
  from public.app_settings
  where key = p_key
  limit 1;
$$;

-- Set values (run in SQL editor with your values):
-- insert into public.app_settings (key, value)
-- values ('push_function_url', 'https://<project-ref>.functions.supabase.co/send-community-push')
-- on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- insert into public.app_settings (key, value)
-- values ('push_webhook_secret', '<random-long-secret>')
-- on conflict (key) do update set value = excluded.value, updated_at = now();
create or replace function public.notify_new_report_push()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url text;
  v_secret text;
begin
  v_url := public.get_app_setting('push_function_url');
  v_secret := public.get_app_setting('push_webhook_secret');

  if v_url is null then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := case
      when v_secret is null then jsonb_build_object('Content-Type', 'application/json')
      else jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
    end,
    body := jsonb_build_object(
      'type', TG_OP,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'record', to_jsonb(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_new_report_push on public.surf_reports;
create trigger trg_notify_new_report_push
after insert on public.surf_reports
for each row
execute function public.notify_new_report_push();

-- RLS
alter table public.user_profiles enable row level security;
alter table public.push_tokens enable row level security;
alter table public.surf_reports enable row level security;
alter table public.user_alert_rules enable row level security;
alter table public.surf_report_votes enable row level security;
alter table public.report_views enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'profiles_select_all'
  ) then
    create policy profiles_select_all on public.user_profiles
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'profiles_insert_self'
  ) then
    create policy profiles_insert_self on public.user_profiles
      for insert with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'profiles_update_self'
  ) then
    create policy profiles_update_self on public.user_profiles
      for update using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'surf_reports' and policyname = 'reports_select_all'
  ) then
    create policy reports_select_all on public.surf_reports
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'surf_reports' and policyname = 'reports_insert_auth'
  ) then
    create policy reports_insert_auth on public.surf_reports
      for insert with check (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_alert_rules' and policyname = 'rules_select_self'
  ) then
    create policy rules_select_self on public.user_alert_rules
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_alert_rules' and policyname = 'rules_insert_self'
  ) then
    create policy rules_insert_self on public.user_alert_rules
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_alert_rules' and policyname = 'rules_update_self'
  ) then
    create policy rules_update_self on public.user_alert_rules
      for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'tokens_select_self'
  ) then
    create policy tokens_select_self on public.push_tokens
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'tokens_insert_self'
  ) then
    create policy tokens_insert_self on public.push_tokens
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'tokens_delete_self'
  ) then
    create policy tokens_delete_self on public.push_tokens
      for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'surf_report_votes' and policyname = 'votes_select_self'
  ) then
    create policy votes_select_self on public.surf_report_votes
      for select using (auth.uid() = voter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'surf_report_votes' and policyname = 'votes_insert_self'
  ) then
    create policy votes_insert_self on public.surf_report_votes
      for insert with check (auth.uid() = voter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'report_views' and policyname = 'views_select_self'
  ) then
    create policy views_select_self on public.report_views
      for select using (auth.uid() = viewer_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'report_views' and policyname = 'views_insert_self'
  ) then
    create policy views_insert_self on public.report_views
      for insert with check (auth.uid() = viewer_id);
  end if;
end $$;

-- Realtime support
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'surf_reports'
  ) then
    alter publication supabase_realtime add table public.surf_reports;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_profiles'
  ) then
    alter publication supabase_realtime add table public.user_profiles;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_alert_rules'
  ) then
    alter publication supabase_realtime add table public.user_alert_rules;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'surf_report_votes'
  ) then
    alter publication supabase_realtime add table public.surf_report_votes;
  end if;
end $$;

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

-- Optional seed data
insert into public.surf_reports (spot_name, reporter_name, comment, score, wind_kts, rating)
select 'Piha', 'Luca local', 'Clean y rapido. Serie buena en banco central.', 18, 7, 'EPIC'
where not exists (
  select 1 from public.surf_reports
  where spot_name = 'Piha'
    and reporter_name = 'Luca local'
    and comment = 'Clean y rapido. Serie buena en banco central.'
);

insert into public.surf_reports (spot_name, reporter_name, comment, score, wind_kts, rating)
select 'Muriwai', 'Nina dawn', 'Subiendo el periodo, pero todavia algo desordenado.', 9, 13, 'GOOD'
where not exists (
  select 1 from public.surf_reports
  where spot_name = 'Muriwai'
    and reporter_name = 'Nina dawn'
    and comment = 'Subiendo el periodo, pero todavia algo desordenado.'
);
