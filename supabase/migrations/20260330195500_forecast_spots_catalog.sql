create table if not exists public.forecast_spots (
  id bigint generated always as identity primary key,
  name text not null unique,
  latitude double precision not null,
  longitude double precision not null,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_forecast_spots_active_priority
  on public.forecast_spots (is_active, priority desc, name);

insert into public.forecast_spots (name, latitude, longitude, is_active, priority)
values
  ('Shipwreck Bay', -35.172, 173.125, true, 0),
  ('90 Mile Beach', -34.933, 173.09, true, 0),
  ('Ahipara', -35.166, 173.153, true, 0),
  ('Sandy Bay (Tutukaka)', -35.603, 174.528, true, 0),
  ('Te Arai Point', -36.093, 174.579, true, 0),
  ('Muriwai', -36.822, 174.425, true, 0),
  ('Piha', -36.952, 174.468, true, 0),
  ('Karekare', -36.986, 174.446, true, 0),
  ('Bethells (Te Henga)', -36.899, 174.441, true, 0),
  ('Raglan (Manu Bay)', -37.825, 174.801, true, 0),
  ('Raglan (Whale Bay)', -37.827, 174.8, true, 0),
  ('Raglan (Indicators)', -37.831, 174.798, true, 0),
  ('Kawhia', -38.07, 174.825, true, 0),
  ('Mount Maunganui - Main Beach', -37.6402, 176.1845, true, 0),
  ('Mount Maunganui - Omanu', -37.6564, 176.2196, true, 0),
  ('Mount Maunganui - Arataki', -37.6686, 176.2388, true, 0),
  ('Mount Maunganui - Tay Street', -37.6455, 176.2031, true, 0),
  ('Mount Maunganui - Moturiki', -37.6337, 176.1805, true, 0),
  ('Papamoa Beach', -37.7014, 176.2871, true, 0),
  ('Pukehina Beach', -37.7992, 176.3045, true, 0),
  ('Whakatane Heads', -37.9496, 176.7245, true, 0),
  ('Maketu', -37.7606, 176.3192, true, 0),
  ('Ohope', -37.9941, 176.6812, true, 0),
  ('Wainui Beach', -38.645, 177.899, true, 0),
  ('Makorori Point', -38.587, 177.954, true, 0),
  ('Midway Beach', -38.673, 177.871, true, 0),
  ('Stent Road', -39.318, 174.215, true, 0),
  ('Fitzroy Beach', -39.04, 174.1, true, 0),
  ('Back Beach', -39.067, 174.03, true, 0),
  ('Lyall Bay', -41.327, 174.801, true, 0),
  ('Titahi Bay', -41.104, 174.843, true, 0),
  ('Castlepoint', -40.901, 176.227, true, 0),
  ('Kaikoura Peninsula', -42.429, 173.697, true, 0),
  ('Sumner Bar', -43.568, 172.759, true, 0),
  ('Taylor''s Mistake', -43.575, 172.771, true, 0),
  ('New Brighton', -43.507, 172.732, true, 0),
  ('St Clair', -45.914, 170.48, true, 0),
  ('St Kilda', -45.906, 170.506, true, 0),
  ('Aramoana', -45.825, 170.563, true, 0),
  ('Kaka Point', -46.401, 170.159, true, 0)
on conflict (name) do update
set latitude = excluded.latitude,
    longitude = excluded.longitude,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.forecast_spots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'forecast_spots' and policyname = 'forecast_spots_select_all'
  ) then
    create policy forecast_spots_select_all on public.forecast_spots
      for select using (true);
  end if;
end $$;
