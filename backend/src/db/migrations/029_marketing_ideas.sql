-- 029_marketing_ideas.sql
-- Marketing Hub Phase 5: staff content/caption/trend idea submissions, with a
-- manager review status (the "added_to_calendar" status maps to SOCi scheduling).

CREATE TABLE IF NOT EXISTS marketing_ideas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES auth.users(id),
  text          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('social','reel','tiktok','campaign','other')),
  reference_url TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','approved','added_to_calendar','dismissed')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marketing_ideas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mkt_ideas_studio ON marketing_ideas (studio_id, submitted_at DESC);
