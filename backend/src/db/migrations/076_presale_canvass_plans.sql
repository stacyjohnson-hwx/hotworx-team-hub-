-- Pre-Sale: dated canvassing plans. Pick a date, pick the businesses to hit that day
-- (filterable by category — e.g. all sororities), then check them off in the field.
CREATE TABLE IF NOT EXISTS presale_canvass_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_canvass_plans_campaign ON presale_canvass_plans(campaign_id);

CREATE TABLE IF NOT EXISTS presale_canvass_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES presale_canvass_plans(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  b2b_contact_id uuid NOT NULL REFERENCES b2b_contacts(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, b2b_contact_id)
);
CREATE INDEX IF NOT EXISTS idx_presale_canvass_stops_plan ON presale_canvass_stops(plan_id);

ALTER TABLE presale_canvass_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_canvass_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY presale_canvass_plans_rw ON presale_canvass_plans FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_canvass_stops_rw ON presale_canvass_stops FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
