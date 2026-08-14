-- Pre-Sale Phase 4 (Polish): prize-bundle tracker.
-- Scripts, QR codes, the route map, CSV import, and the promotions panel are all
-- read/compose over data that already exists — bundles are the only new storage.
CREATE TABLE IF NOT EXISTS presale_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name text NOT NULL,
  tag text,
  blurb text,
  target_value numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presale_bundles_campaign ON presale_bundles(campaign_id);

-- A prize-donor partner's donation can be earmarked for a bundle.
ALTER TABLE presale_partners ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES presale_bundles(id) ON DELETE SET NULL;

ALTER TABLE presale_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY presale_bundles_rw ON presale_bundles FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));

-- Seed Madison's three giveaway bundles.
INSERT INTO presale_bundles (campaign_id, studio_id, name, tag, blurb, target_value, sort_order)
SELECT c.id, c.studio_id, b.name, b.tag, b.blurb, b.target_value, b.sort_order
FROM presale_campaigns c
JOIN studios s ON s.id = c.studio_id AND s.code = 'WI0021'
CROSS JOIN (VALUES
  ('Founding Member Bundle', 'founding', 'Grand-prize giveaway for launch-week sign-ups', 500, 1),
  ('Glow & Go Bundle', 'glowgo', 'Local wellness + beauty prizes from partner businesses', 300, 2),
  ('Sweat Squad Bundle', 'sweatsquad', 'Gear, gift cards, and swag for the referral leaderboard', 300, 3)
) AS b(name, tag, blurb, target_value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM presale_bundles x WHERE x.campaign_id = c.id);
