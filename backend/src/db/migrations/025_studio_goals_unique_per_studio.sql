-- 025_studio_goals_unique_per_studio.sql
-- studio_goals was uniquely keyed on (month, year) only, so two studios couldn't
-- have separate goals for the same month and the upsert's ON CONFLICT
-- (studio_id, month, year) had no matching constraint (save failed).
-- Re-key it per studio.

ALTER TABLE studio_goals DROP CONSTRAINT IF EXISTS studio_goals_month_year_key;
ALTER TABLE studio_goals ADD CONSTRAINT studio_goals_studio_month_year_key UNIQUE (studio_id, month, year);
