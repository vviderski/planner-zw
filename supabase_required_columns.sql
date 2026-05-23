-- Planner ZW - wymagane kolumny dla aktualnej wersji aplikacji.
-- Uruchom w Supabase SQL Editor.
-- Skrypt jest bezpieczny dla istniejących kolumn dzięki "if not exists".

-- PROFILE użytkowników
alter table public.profiles
add column if not exists full_name text,
add column if not exists role text not null default 'technik';

-- KLIENCI
alter table public.clients
add column if not exists name text not null default '';

-- KATEGORIE KLIENTÓW
alter table public.client_categories
add column if not exists client_id bigint,
add column if not exists name text not null default '',
add column if not exists default_hours numeric not null default 8;

-- ZADANIA / ZLECENIA
alter table public.tasks
add column if not exists title text not null default '',
add column if not exists client_id bigint,
add column if not exists category_id bigint,
add column if not exists technik_id uuid,
add column if not exists technician_ids uuid[] not null default '{}',
add column if not exists start_date date,
add column if not exists end_date date,
add column if not exists client_name text,
add column if not exists description text,
add column if not exists address text,
add column if not exists store_number text,
add column if not exists external_key text,
add column if not exists ticket_number text,
add column if not exists duration_hours numeric,
add column if not exists status text not null default 'Do realizacji';

-- HISTORIA KAFELEK
create table if not exists public.task_history (
  id bigserial primary key,
  task_id bigint not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists task_history_task_id_created_at_idx
on public.task_history(task_id, created_at desc);

alter table public.task_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'task_history'
      and policyname = 'task_history_select_authenticated'
  ) then
    create policy task_history_select_authenticated
    on public.task_history
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'task_history'
      and policyname = 'task_history_insert_authenticated'
  ) then
    create policy task_history_insert_authenticated
    on public.task_history
    for insert
    to authenticated
    with check (true);
  end if;
end $$;

-- Status jest kontrolowany checkboxem w aplikacji:
-- niezaznaczony = "Do realizacji", zaznaczony = "Zrealizowane".
alter table public.tasks
drop constraint if exists tasks_status_check;

update public.tasks
set status = 'Do realizacji'
where status is null
   or status not in ('Do realizacji', 'Zrealizowane', 'Anulowane');

alter table public.tasks
add constraint tasks_status_check
check (status in ('Do realizacji', 'Zrealizowane', 'Anulowane'));

-- Migracja starych zadań: jeśli było tylko jedno pole technik_id,
-- przenieś je do nowej listy technician_ids.
update public.tasks
set technician_ids = array[technik_id]::uuid[]
where technik_id is not null
  and (technician_ids is null or cardinality(technician_ids) = 0);

-- Opcjonalne relacje, jeśli tabele mają standardowe klucze id.
-- Jeśli Supabase zgłosi, że constraint już istnieje, możesz pominąć tę sekcję.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_categories_client_id_fkey'
  ) then
    alter table public.client_categories
    add constraint client_categories_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_client_id_fkey'
  ) then
    alter table public.tasks
    add constraint tasks_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_category_id_fkey'
  ) then
    alter table public.tasks
    add constraint tasks_category_id_fkey
    foreign key (category_id) references public.client_categories(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tasks_technik_id_fkey'
  ) then
    alter table public.tasks
    add constraint tasks_technik_id_fkey
    foreign key (technik_id) references public.profiles(id) on delete set null;
  end if;
end $$;
