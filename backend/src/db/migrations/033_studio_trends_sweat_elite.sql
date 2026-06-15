-- 033_studio_trends_sweat_elite.sql
-- Adds Sweat Elite % to the monthly Studio Trends entry. The Monthly Scorecard
-- pulls this into the "Sweat Elite Mix" metric.

ALTER TABLE studio_trends ADD COLUMN IF NOT EXISTS sweat_elite_pct NUMERIC DEFAULT 0;

NOTIFY pgrst, 'reload schema';
