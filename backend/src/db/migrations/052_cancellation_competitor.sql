-- Capture which competitor a member is leaving for (shown when the cancellation
-- reason is "Going to a competitor").
ALTER TABLE cancellation_log ADD COLUMN IF NOT EXISTS competitor_name text;
