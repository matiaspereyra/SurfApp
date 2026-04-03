-- Track whether a user currently has the app in foreground.
create table if not exists public.push_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_foreground boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_presence_user_id on public.push_presence (user_id);

create or replace function public.save_push_presence(p_is_foreground boolean)
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

  insert into public.push_presence (user_id, is_foreground, last_seen_at, updated_at)
  values (v_user_id, coalesce(p_is_foreground, false), now(), now())
  on conflict (user_id) do update
  set is_foreground = excluded.is_foreground,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.save_push_presence(boolean) to authenticated;