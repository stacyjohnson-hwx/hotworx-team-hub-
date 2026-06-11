-- 026_marketing_hub.sql
-- Marketing & Content Hub — Phase 1: task definitions + completions.
-- Replaces the static Growth marketing checklist with a real, trackable,
-- studio-scoped, role-aware task system. Content library, points/leaderboard,
-- manager dashboard, and ideas come in later phases.

CREATE TABLE IF NOT EXISTS marketing_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id        UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  type             TEXT NOT NULL DEFAULT 'studio_wide' CHECK (type IN ('studio_wide','role','seasonal')),
  category         TEXT DEFAULT 'content' CHECK (category IN ('content','engagement','social','community','retention')),
  role_target      TEXT NOT NULL DEFAULT 'all',
  point_value      INTEGER NOT NULL DEFAULT 10,
  required_uploads INTEGER NOT NULL DEFAULT 0,
  required_fields  JSONB NOT NULL DEFAULT '[]'::jsonb,
  cadence          TEXT NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily','weekly','shift')),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_task_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES marketing_tasks(id) ON DELETE CASCADE,
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES auth.users(id),
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  field_values    JSONB NOT NULL DEFAULT '{}'::jsonb,
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','flagged')),
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_task_completions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mkt_tasks_studio ON marketing_tasks (studio_id);
CREATE INDEX IF NOT EXISTS idx_mkt_compl_studio_date ON marketing_task_completions (studio_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_mkt_compl_staff ON marketing_task_completions (staff_id, completion_date);
