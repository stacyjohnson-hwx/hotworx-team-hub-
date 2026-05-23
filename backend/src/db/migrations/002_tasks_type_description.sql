-- Add description and task_type to cleaning_tasks
-- Run this in the Supabase SQL Editor

ALTER TABLE cleaning_tasks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'Cleaning'
    CHECK (task_type IN ('Cleaning', 'Marketing', 'Operations'));
