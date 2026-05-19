-- Naprawa błędu:
-- new row for relation "tasks" violates check constraint "tasks_status_check"
--
-- Aktualna aplikacja używa wyłącznie:
-- checkbox niezaznaczony = "Do realizacji"
-- checkbox zaznaczony = "Zrealizowane"

alter table public.tasks
drop constraint if exists tasks_status_check;

alter table public.tasks
alter column status set default 'Do realizacji';

update public.tasks
set status = 'Do realizacji'
where status is null
   or status not in ('Do realizacji', 'Zrealizowane');

alter table public.tasks
add constraint tasks_status_check
check (status in ('Do realizacji', 'Zrealizowane'));
