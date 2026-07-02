-- Quick "likely to return" flag on a cancellation, so those rows can be tinted
-- in the list as warm win-back prospects.
ALTER TABLE cancellation_log ADD COLUMN IF NOT EXISTS likely_to_return boolean NOT NULL DEFAULT false;
