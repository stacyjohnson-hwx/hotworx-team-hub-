-- 021_eod_completed_training.sql
-- EOD rework: store the training the TSA marked complete (pulled from the
-- Training module) as a snapshot array on each EOD submission, replacing the
-- old hardcoded sales-training checkboxes.

ALTER TABLE eod_submissions
  ADD COLUMN IF NOT EXISTS completed_training JSONB NOT NULL DEFAULT '[]'::jsonb;
