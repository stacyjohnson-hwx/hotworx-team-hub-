-- Social Media Coach (extends the Social Analytics module). A holistic, on-demand
-- AI report: it reads the data the social feature already collects (channel
-- snapshots, own posts + metrics + teardowns, external trend posts) and asks
-- Claude to coach the studio's whole presence — engagement, lead flow, content,
-- and team actions. Unlike per-post teardowns, one rich report per generation.
-- Multi-studio from day one (studio_id everywhere). Latest row wins; history kept.
CREATE TABLE IF NOT EXISTS social_coach_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  report jsonb NOT NULL,                 -- full structured coaching payload
  inputs jsonb,                          -- snapshot of the numbers the advice was based on
  model text,
  status text NOT NULL DEFAULT 'ok',     -- ok | unavailable
  generated_by uuid,                     -- user id who ran the refresh
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_reports_studio
  ON social_coach_reports (studio_id, generated_at DESC);
