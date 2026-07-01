-- Adds a "specific_days" cleaning-task frequency: a task can be scheduled on an
-- arbitrary set of weekdays (e.g. Mon/Wed/Fri) instead of just daily or weekly.
-- days_of_week holds integers 0=Sun … 6=Sat. Resets each day like a daily task.
alter table public.cleaning_tasks add column if not exists days_of_week integer[];

-- Allow 'specific_days' in the frequency CHECK constraint (was daily/weekly/…only).
alter table public.cleaning_tasks drop constraint if exists cleaning_tasks_frequency_check;
alter table public.cleaning_tasks add constraint cleaning_tasks_frequency_check
  check (frequency = any (array['daily','specific_days','weekly','monthly','quarterly','one_off']));
