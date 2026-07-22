-- 072_planner_holidays.sql
-- Studio-added holidays / seasonal days for the Monthly Planner. Intentionally
-- keyed by MONTH ONLY (no year) so anything added to e.g. July recurs every July.

CREATE TABLE IF NOT EXISTS public.planner_holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id  UUID NOT NULL REFERENCES public.studios(id),
  month      INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  label      TEXT NOT NULL,
  day        INT  CHECK (day BETWEEN 1 AND 31),   -- optional day-of-month
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_holidays_studio_month
  ON public.planner_holidays(studio_id, month);

ALTER TABLE public.planner_holidays ENABLE ROW LEVEL SECURITY;
-- No policies: backend service-role access only.
