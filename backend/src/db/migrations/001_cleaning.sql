-- Cleaning Checklist: task library + daily completions
-- Run this in the Supabase SQL Editor

-- Task library (managed by owner/manager)
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  area          TEXT,                          -- e.g. "Lobby", "Sauna 1", "Restrooms"
  frequency     TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','one_off')),
  day_of_week   INT CHECK (day_of_week BETWEEN 0 AND 6),   -- 0=Sun … 6=Sat; weekly tasks
  day_of_month  INT CHECK (day_of_month BETWEEN 1 AND 31), -- monthly tasks
  quarterly_dates DATE[],                      -- up to 4 dates per year; quarterly tasks
  one_off_date  DATE,                          -- one-off tasks
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TSA completions (one row per task per calendar date)
CREATE TABLE IF NOT EXISTS cleaning_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by    UUID NOT NULL REFERENCES auth.users(id),
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, completion_date)             -- one completion per task per day
);

-- Auto-update updated_at on cleaning_tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleaning_tasks_updated_at ON cleaning_tasks;
CREATE TRIGGER cleaning_tasks_updated_at
  BEFORE UPDATE ON cleaning_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE cleaning_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_completions ENABLE ROW LEVEL SECURITY;

-- cleaning_tasks: all authenticated users can read; only owner/manager can write
CREATE POLICY "cleaning_tasks_select" ON cleaning_tasks
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cleaning_tasks_insert" ON cleaning_tasks
  FOR INSERT WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "cleaning_tasks_update" ON cleaning_tasks
  FOR UPDATE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "cleaning_tasks_delete" ON cleaning_tasks
  FOR DELETE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

-- cleaning_completions: all authenticated users can read; any authenticated user can insert/delete their own
CREATE POLICY "cleaning_completions_select" ON cleaning_completions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cleaning_completions_insert" ON cleaning_completions
  FOR INSERT WITH CHECK (auth.uid() = completed_by);

CREATE POLICY "cleaning_completions_delete" ON cleaning_completions
  FOR DELETE USING (auth.uid() = completed_by);
