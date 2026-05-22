-- Planner ZW - adres dojazdu i historia zmian kafelek.
-- Uruchom w Supabase SQL Editor, jeśli używasz starszej bazy.

alter table public.tasks
add column if not exists address text;

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
