-- 089_cleaning_annual_frequency.sql
-- Add an "annual" cleaning-task frequency: the task recurs once a year on the
-- month + day stored in one_off_date (the year is ignored when matching), e.g.
-- an annual deep-clean or filter change. Reuses one_off_date so no new column.

ALTER TABLE cleaning_tasks DROP CONSTRAINT IF EXISTS cleaning_tasks_frequency_check;
ALTER TABLE cleaning_tasks ADD CONSTRAINT cleaning_tasks_frequency_check
  CHECK (frequency = ANY (ARRAY['daily','specific_days','weekly','monthly','quarterly','one_off','annual']));
