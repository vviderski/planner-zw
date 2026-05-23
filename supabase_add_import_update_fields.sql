-- Planner ZW - pola potrzebne do aktualizacji kafelek z XLS.
-- Uruchom w Supabase SQL Editor, jeśli baza powstała przed tą zmianą.

alter table public.tasks
add column if not exists store_number text,
add column if not exists external_key text;

alter table public.tasks
drop constraint if exists tasks_status_check;

update public.tasks
set status = 'Do realizacji'
where status is null
   or status not in ('Do realizacji', 'Zrealizowane', 'Anulowane');

alter table public.tasks
add constraint tasks_status_check
check (status in ('Do realizacji', 'Zrealizowane', 'Anulowane'));
