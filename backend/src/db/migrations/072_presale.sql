-- Pre-Sale planner (PRD Phase 1 — Track) + per-studio visibility flag.
-- studios.presale_enabled gates the Pre-Sale tab (Franchise Admin toggle); OFF for
-- everyone except Madison (WI0021), which gets a seeded 1,000-lead campaign.
ALTER TABLE studios ADD COLUMN IF NOT EXISTS presale_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS presale_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal_leads int NOT NULL DEFAULT 1000,
  starts_on date, launch_day date, ends_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planning','active','complete')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS presale_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  key text NOT NULL, label text NOT NULL, channel_group text,
  plan_units numeric NOT NULL DEFAULT 0, plan_per_unit numeric NOT NULL DEFAULT 0, sort_order int NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, key)
);
-- The ledger: actuals are always SUM(lead_count), never a typed-over number.
CREATE TABLE IF NOT EXISTS presale_lead_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES presale_channels(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  logged_on date NOT NULL DEFAULT current_date,
  lead_count int NOT NULL,
  source_tag text, b2b_contact_id uuid, event_id uuid, territory_id uuid, notes text,
  logged_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_lead_log_channel ON presale_lead_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_presale_lead_log_campaign_date ON presale_lead_log(campaign_id, logged_on);

ALTER TABLE presale_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_lead_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY presale_campaigns_rw ON presale_campaigns FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_channels_rw ON presale_channels FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_lead_log_rw ON presale_lead_log FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));

-- Seed: Madison only.
UPDATE studios SET presale_enabled=true WHERE code='WI0021';
INSERT INTO presale_campaigns (studio_id, name, goal_leads, status)
SELECT id,'Madison Pre-Sale',1000,'active' FROM studios WHERE code='WI0021'
  AND NOT EXISTS (SELECT 1 FROM presale_campaigns pc WHERE pc.studio_id=studios.id);
WITH camp AS (SELECT c.id, c.studio_id FROM presale_campaigns c JOIN studios s ON s.id=c.studio_id WHERE s.code='WI0021' LIMIT 1)
INSERT INTO presale_channels (campaign_id, studio_id, key, label, channel_group, plan_units, plan_per_unit, sort_order)
SELECT camp.id, camp.studio_id, v.key, v.label, v.grp, v.units, v.per, v.ord
FROM camp, (VALUES
  ('meta','Meta Ads','Always on',1,300,1),
  ('organic','Organic Social','Always on',1,100,2),
  ('bizcanvass','Business Canvassing','Feet on the street',40,3,3),
  ('apartments','Apartments','Feet on the street',30,3,4),
  ('events','Events & Pop-ups','Feet on the street',8,25,5),
  ('bizamb','Business Ambassadors','Ambassadors',10,10,6),
  ('commamb','Community Ambassadors','Ambassadors',5,10,7),
  ('members','Member Referrals','People',20,2,8)
) AS v(key,label,grp,units,per,ord)
WHERE NOT EXISTS (SELECT 1 FROM presale_channels pc WHERE pc.campaign_id=camp.id AND pc.key=v.key);
