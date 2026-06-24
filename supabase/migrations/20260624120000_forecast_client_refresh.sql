create or replace function public.trigger_forecast_refresh()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.request_forecast_refresh();
end;
$$;

grant execute on function public.trigger_forecast_refresh() to anon;
grant execute on function public.trigger_forecast_refresh() to authenticated;
