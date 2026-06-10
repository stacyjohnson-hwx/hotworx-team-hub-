-- 024_territories.sql
-- B2B Phase 2: server-backed Territory tracker for neighborhoods & apartment
-- complexes. Each zone has a flexible cadence ("hit every N days"); visits are
-- logged to recompute last-hit / next-due / overdue. Replaces the per-browser
-- localStorage neighborhoods so the whole team shares one source of truth.

CREATE TABLE IF NOT EXISTS territories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'neighborhood' CHECK (type IN ('neighborhood','apartment')),
  address      TEXT,
  latitude     NUMERIC,
  longitude    NUMERIC,
  cadence_days INTEGER NOT NULL DEFAULT 21,
  assigned_to  UUID REFERENCES auth.users(id),
  notes        TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territory_visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id  UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  studio_id     UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  visited_by    UUID REFERENCES auth.users(id),
  visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_type TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE territory_visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_territories_studio ON territories (studio_id);
CREATE INDEX IF NOT EXISTS idx_territory_visits_terr ON territory_visits (territory_id);
