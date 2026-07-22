-- 071_monthly_plans.sql
-- One editable Monthly Planner document per studio per month. Planner-owned
-- content (target selections, planned meeting/contest/social posts, notes) lives
-- in `content` JSONB. Studio goal TARGETS are NOT stored here — they write through
-- to studio_goals via the existing Goals endpoint (no double entry).

CREATE TABLE IF NOT EXISTS public.monthly_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES public.studios(id),
  year        INT  NOT NULL,
  month       INT  NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (studio_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_studio ON public.monthly_plans(studio_id, year, month);

ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;
-- No policies: all access via the backend service-role client (bypasses RLS);
-- RLS-on/no-policy denies direct client access.
