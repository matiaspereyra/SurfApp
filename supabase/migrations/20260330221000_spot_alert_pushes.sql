create table if not exists public.alert_push_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  spot_name text not null,
  rating text not null,
  forecast_date date not null,
  provider text,
  source_model text,
  run_id bigint,
  message_payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

create unique index if not exists idx_alert_push_events_user_spot_day_rating
  on public.alert_push_events (user_id, spot_name, forecast_date, rating);

create index if not exists idx_alert_push_events_user_sent_at
  on public.alert_push_events (user_id, sent_at desc);

create index if not exists idx_alert_push_events_spot_day
  on public.alert_push_events (spot_name, forecast_date desc);

create table if not exists public.alert_push_admin_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  severity text not null default 'warning',
  title text,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_alert_push_admin_events_created_at
  on public.alert_push_admin_events (created_at desc);

insert into public.app_settings (key, value)
values ('spot_alert_function_url', 'https://ydkkvrahxfosegogorad.functions.supabase.co/send-spot-alerts')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.app_settings (key, value)
values ('spot_alert_webhook_secret', '2d5a6c9e-4a9d-4a7b-bca4-5d6e4d13a8f2')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.app_settings (key, value)
values ('spot_alert_cooldown_hours', '8')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.app_settings (key, value)
values ('spot_alert_daily_limit', '3')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.app_settings (key, value)
values ('spot_alert_admin_threshold_per_run', '40')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.request_spot_alert_pushes()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_secret text;
begin
  v_url := public.get_app_setting('spot_alert_function_url');
  v_secret := public.get_app_setting('spot_alert_webhook_secret');

  if v_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := case
      when v_secret is null then jsonb_build_object('Content-Type', 'application/json')
      else jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
    end,
    body := jsonb_build_object(
      'timezone', 'Pacific/Auckland'
    )
  );
end;
$$;

grant execute on function public.request_spot_alert_pushes() to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_alert_job_id bigint;
begin
  select jobid into v_alert_job_id
  from cron.job
  where jobname = 'forecast_spot_alerts_q6h'
  limit 1;

  if v_alert_job_id is not null then
    perform cron.unschedule(v_alert_job_id);
  end if;

  perform cron.schedule(
    'forecast_spot_alerts_q6h',
    '35 */6 * * *',
    $job$select public.request_spot_alert_pushes();$job$
  );
end;
$$;
