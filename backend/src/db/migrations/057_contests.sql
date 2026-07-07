-- Team contests: friendly competitions among studio staff. A contest is either
-- AUTO (leaderboard computed from existing metrics for a month) or MANUAL
-- (owner/manager types in scores). Winner is snapshotted on end so the Hall of
-- Fame stays stable even as underlying data changes.
CREATE TABLE IF NOT EXISTS contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title text NOT NULL,
  description_html text NOT NULL DEFAULT '',
  prize text,
  cover_image jsonb,                                  -- {url, path} or null
  scoring_mode text NOT NULL DEFAULT 'manual',        -- 'auto' | 'manual'
  metric text,                                        -- auto: memberships|retail|eft|outreach|leadgen_points|commission
  score_label text,                                   -- manual: what's being counted, e.g. "Reviews"
  period_month int,                                   -- auto contests align to the app's month model
  period_year int,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'active',              -- 'active' | 'ended' (upcoming derived from starts_on)
  winner_id uuid,
  winner_name text,
  winner_score numeric,
  ended_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contests_studio
  ON contests (studio_id, status, ends_on DESC);
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;

-- Manual score entries; also holds the frozen leaderboard snapshot for ended
-- auto contests (one row per participant).
CREATE TABLE IF NOT EXISTS contest_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (contest_id, user_id)
);
ALTER TABLE contest_scores ENABLE ROW LEVEL SECURITY;

-- Cheers — mirrors announcement_reactions.
CREATE TABLE IF NOT EXISTS contest_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (contest_id, user_id, emoji)
);
ALTER TABLE contest_reactions ENABLE ROW LEVEL SECURITY;

-- Service-role backend only; no anon/authenticated policies (RLS-on = deny by default).
