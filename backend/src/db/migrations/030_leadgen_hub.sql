-- 030_leadgen_hub.sql
-- Lead Gen Hub — mirrors the Marketing Hub for lead generation.
--   leadgen_plays       : the idea bank. A play sits in the bank (active=false) until a
--                         manager activates it (active=true), at which point it becomes a
--                         live task TSAs see in "My Lead Gen". archived=true removes it.
--   leadgen_completions : TSA completion log + points per play.
--   leadgen_suggestions : staff submission board; a manager can promote a suggestion into
--                         the bank as a new play.

CREATE TABLE IF NOT EXISTS leadgen_plays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  steps       TEXT,
  category    TEXT NOT NULL DEFAULT 'in_studio' CHECK (category IN ('neighborhood','b2b','referral','events','digital','in_studio')),
  point_value INTEGER NOT NULL DEFAULT 20,
  cadence     TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly','one_off')),
  role_target TEXT NOT NULL DEFAULT 'all',
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leadgen_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  play_id         UUID NOT NULL REFERENCES leadgen_plays(id) ON DELETE CASCADE,
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES auth.users(id),
  completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leadgen_suggestions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES auth.users(id),
  text         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'in_studio' CHECK (category IN ('neighborhood','b2b','referral','events','digital','in_studio')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','promoted','dismissed')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leadgen_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadgen_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadgen_suggestions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lg_plays_studio ON leadgen_plays (studio_id);
CREATE INDEX IF NOT EXISTS idx_lg_compl_studio_date ON leadgen_completions (studio_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_lg_sugg_studio ON leadgen_suggestions (studio_id, submitted_at DESC);
