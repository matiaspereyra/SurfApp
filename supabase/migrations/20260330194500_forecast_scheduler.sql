create extension if not exists pg_cron with schema extensions;

insert into public.app_settings (key, value)
values ('forecast_function_url', 'https://ydkkvrahxfosegogorad.functions.supabase.co/fetch-forecast')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.app_settings (key, value)
values ('forecast_webhook_secret', '775c7f67-554f-4ca6-a2c6-e51a0b50a364')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.request_forecast_refresh()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_secret text;
begin
  v_url := public.get_app_setting('forecast_function_url');
  v_secret := public.get_app_setting('forecast_webhook_secret');

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
      'source_model', 'open-meteo-marine',
      'timezone', 'Pacific/Auckland',
      'forecast_days', 16
    )
  );
end;
$$;

create or replace function public.request_forecast_prune()
returns void
language sql
security definer
as $$
  select public.prune_old_forecast_data(21);
$$;

grant execute on function public.request_forecast_refresh() to service_role;
grant execute on function public.request_forecast_prune() to service_role;

do $$
declare
  v_refresh_job_id bigint;
  v_prune_job_id bigint;
begin
  select jobid into v_refresh_job_id
  from cron.job
  where jobname = 'forecast_refresh_q6h'
  limit 1;

  if v_refresh_job_id is not null then
    perform cron.unschedule(v_refresh_job_id);
  end if;

  perform cron.schedule(
    'forecast_refresh_q6h',
    '10 */6 * * *',
    $job$select public.request_forecast_refresh();$job$
  );

  select jobid into v_prune_job_id
  from cron.job
  where jobname = 'forecast_prune_daily'
  limit 1;

  if v_prune_job_id is not null then
    perform cron.unschedule(v_prune_job_id);
  end if;

  perform cron.schedule(
    'forecast_prune_daily',
    '40 3 * * *',
    $job$select public.request_forecast_prune();$job$
  );
end;
$$;
