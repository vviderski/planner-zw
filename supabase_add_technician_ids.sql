alter table public.tasks
add column if not exists technician_ids uuid[] not null default '{}';

update public.tasks
set technician_ids = array[technik_id]::uuid[]
where technik_id is not null
  and (technician_ids is null or cardinality(technician_ids) = 0);
