-- 032_monthly_scorecard.sql
-- Monthly Studio Scorecard — interactive manager dashboard.
--   scorecard_months : one row per studio per month. `actuals` is a JSONB map of
--                      { metric_key -> value }. reviewed_by/reviewed_at = owner sign-off.
--   scorecard_goals  : owner-editable goal overrides. When no row exists for a
--                      metric_key, the default from services/scorecardCatalog.js applies.
--
-- Metric keys are stable identifiers (see scorecardCatalog.js) so a future
-- SAIL / Instagram / reviews importer can map directly to them.
--
-- NOTE: the backend also bootstraps this schema lazily at runtime
-- (services/scorecardSchema.js); this file is the migration of record.

CREATE TABLE IF NOT EXISTS scorecard_months (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  actuals     JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (studio_id, year, month)
);

CREATE TABLE IF NOT EXISTS scorecard_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  metric_key      TEXT NOT NULL,
  goal            NUMERIC,
  lower_is_better BOOLEAN,
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (studio_id, metric_key)
);

ALTER TABLE scorecard_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_goals  ENABLE ROW LEVEL SECURITY;

-- Backend uses the service_role key (bypasses RLS); grant it explicitly.
GRANT ALL ON scorecard_months TO service_role;
GRANT ALL ON scorecard_goals  TO service_role;

NOTIFY pgrst, 'reload schema';
