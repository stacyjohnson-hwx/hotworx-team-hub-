-- 028_marketing_settings.sql
-- Marketing Hub Phase 3: per-studio leaderboard settings — configurable weekly
-- reward label, and a manual reset timestamp (weekly points are counted since
-- the later of this week's Sunday or the last manual reset).

CREATE TABLE IF NOT EXISTS marketing_settings (
  studio_id            UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  weekly_reward_label  TEXT,
  leaderboard_reset_at TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marketing_settings ENABLE ROW LEVEL SECURITY;
