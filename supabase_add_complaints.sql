-- Planner ZW - reklamacje z raportow Service Desk.
-- Uruchom w Supabase SQL Editor przed pierwszym importem reklamacji.

create table if not exists public.complaints (
  id bigserial primary key,
  source_id text,
  ticket_id text not null,
  task_id bigint references public.tasks(id) on delete set null,
  match_status text not null default 'Brak przypisanego zadania',
  type text,
  client_name text,
  priority text,
  complaint_date date,
  created_by text,
  root_category text,
  category text,
  description text,
  resolved_on_workgroup text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  raw_payload jsonb,
  imported_at timestamptz not null default now()
);

create unique index if not exists complaints_source_id_key
on public.complaints(source_id);

create index if not exists complaints_ticket_id_idx
on public.complaints(ticket_id);

create index if not exists complaints_task_id_idx
on public.complaints(task_id);

create index if not exists complaints_complaint_date_idx
on public.complaints(complaint_date);

alter table public.complaints enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'complaints'
      and policyname = 'complaints_select_authenticated'
  ) then
    create policy complaints_select_authenticated
    on public.complaints
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'complaints'
      and policyname = 'complaints_insert_authenticated'
  ) then
    create policy complaints_insert_authenticated
    on public.complaints
    for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'complaints'
      and policyname = 'complaints_update_authenticated'
  ) then
    create policy complaints_update_authenticated
    on public.complaints
    for update
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;
