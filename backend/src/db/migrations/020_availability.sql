-- 020_availability.sql
-- Phase 1 of AI-assisted scheduling: team members enter their recurring weekly
-- availability. Time-off requests act as date-specific overrides on top of this.

CREATE TABLE IF NOT EXISTS availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun ... 6=Sat
  available    BOOLEAN NOT NULL DEFAULT true,   -- false = cannot work this day
  all_day      BOOLEAN NOT NULL DEFAULT true,   -- true = available any time that day
  start_time   TIME,                            -- used when available && !all_day
  end_time     TIME,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, studio_id, day_of_week)
);

-- Backend accesses via service-role key (bypasses RLS); enable RLS so the
-- Data API (anon/authenticated) cannot reach this table directly.
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_availability_studio ON availability (studio_id);
CREATE INDEX IF NOT EXISTS idx_availability_user ON availability (user_id, studio_id);
