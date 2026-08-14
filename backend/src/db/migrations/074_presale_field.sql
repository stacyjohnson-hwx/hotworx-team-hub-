-- Pre-Sale Phase 3 (Field): ambassadors + daily drivers.
-- Canvass reuses the existing territories / territory_visits tables (no schema change);
-- visit leads post to presale_lead_log.territory_id, already present from migration 072.

-- Individuals who drive referral leads via a source tag. Business ambassadors stay in
-- presale_partners (role business_ambassador); this roster is members / community / staff.
CREATE TABLE IF NOT EXISTS presale_ambassadors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  handle text,
  type text NOT NULL DEFAULT 'community' CHECK (type IN ('member','community','staff')),
  org_name text,
  b2b_contact_id uuid REFERENCES b2b_contacts(id) ON DELETE SET NULL,
  source_tag text NOT NULL,
  reward_tier text,
  contact text,
  assigned_to uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, source_tag)
);
CREATE INDEX IF NOT EXISTS idx_presale_ambassadors_campaign ON presale_ambassadors(campaign_id);

-- Per-person daily targets (follow N accounts, call back N leads, visit N buildings).
CREATE TABLE IF NOT EXISTS presale_daily_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  label text NOT NULL,
  target int NOT NULL DEFAULT 0,
  assigned_to uuid,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_drivers_campaign ON presale_daily_drivers(campaign_id);

-- The daily counter — one row per (driver, day, person); the increment is an upsert.
CREATE TABLE IF NOT EXISTS presale_driver_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES presale_daily_drivers(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  logged_on date NOT NULL,
  count int NOT NULL DEFAULT 0,
  logged_by uuid NOT NULL,
  UNIQUE (driver_id, logged_on, logged_by)
);
CREATE INDEX IF NOT EXISTS idx_presale_driver_log_driver ON presale_driver_log(driver_id);

ALTER TABLE presale_ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_daily_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_driver_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY presale_ambassadors_rw ON presale_ambassadors FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_daily_drivers_rw ON presale_daily_drivers FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_driver_log_rw ON presale_driver_log FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));

-- Seed Madison's campaign with three starter daily drivers so the strip isn't empty.
INSERT INTO presale_daily_drivers (campaign_id, studio_id, label, target, sort_order)
SELECT c.id, c.studio_id, d.label, d.target, d.sort_order
FROM presale_campaigns c
JOIN studios s ON s.id = c.studio_id AND s.code = 'WI0021'
CROSS JOIN (VALUES
  ('Follow-up calls / texts to warm leads', 15, 1),
  ('Businesses visited / dropped', 5, 2),
  ('Social DMs + follows', 20, 3)
) AS d(label, target, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM presale_daily_drivers x WHERE x.campaign_id = c.id);
