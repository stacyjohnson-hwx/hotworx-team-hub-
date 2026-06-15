// Idempotent schema bootstrap for the Monthly Studio Scorecard.
//
// The Supabase MCP / SQL editor is the usual path for DDL, but to keep this feature
// self-contained we lazily ensure the tables exist on first use via the pg pool
// (DATABASE_URL). It runs once per process (cached promise) and is wrapped so a
// failure is logged but never crashes the request — the route surfaces a clear
// "schema not initialized" error if persistence isn't available.

const pool = require('../db/db')

const DDL = `
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
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id      UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  metric_key     TEXT NOT NULL,
  goal           NUMERIC,
  lower_is_better BOOLEAN,
  updated_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (studio_id, metric_key)
);

ALTER TABLE scorecard_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_goals  ENABLE ROW LEVEL SECURITY;

GRANT ALL ON scorecard_months TO service_role;
GRANT ALL ON scorecard_goals  TO service_role;

NOTIFY pgrst, 'reload schema';
`

let ready = null

function ensureScorecardSchema() {
  if (ready) return ready
  ready = pool
    .query(DDL)
    .then(() => {
      console.log('[scorecard] schema ensured')
      return true
    })
    .catch((err) => {
      // Don't permanently cache the failure — allow a retry on the next request.
      ready = null
      console.error('[scorecard] schema bootstrap failed:', err.message)
      throw err
    })
  return ready
}

module.exports = { ensureScorecardSchema }
