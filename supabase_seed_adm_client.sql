-- Planner ZW - klient ADM i kategorie niedostepnosci technika.
-- Uruchom w Supabase SQL Editor, jezeli klient ADM nie istnieje jeszcze w bazie.

insert into public.clients (name)
select 'ADM'
where not exists (
  select 1 from public.clients where lower(name) = lower('ADM')
);

insert into public.client_categories (client_id, name, default_hours)
select c.id, category.name, category.default_hours
from public.clients c
cross join (
  values
    ('serwis pojazdu', 8),
    ('Urlop', 8),
    ('L4', 8)
) as category(name, default_hours)
where lower(c.name) = lower('ADM')
  and not exists (
    select 1
    from public.client_categories cc
    where cc.client_id = c.id
      and lower(cc.name) = lower(category.name)
  );
