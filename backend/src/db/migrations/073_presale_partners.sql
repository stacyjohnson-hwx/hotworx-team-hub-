-- Pre-Sale Phase 2 (Connect): tie the campaign to real businesses + events.
-- presale_partners is the campaign↔b2b_contacts join (a business can hold more than
-- one role). presale_event_links attaches existing/new events to the campaign.
CREATE TABLE IF NOT EXISTS presale_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  b2b_contact_id uuid NOT NULL REFERENCES b2b_contacts(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('hour_sponsor','prize_donor','business_ambassador','event_host','corporate','apartment')),
  status text NOT NULL DEFAULT 'pitched' CHECK (status IN ('pitched','committed','confirmed','declined')),
  hour_slot time, commitment text, prize_item text, prize_value numeric,
  ig_live_confirmed boolean NOT NULL DEFAULT false,
  source_tag text, assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, b2b_contact_id, role)
);
CREATE INDEX IF NOT EXISTS idx_presale_partners_campaign ON presale_partners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_presale_partners_contact ON presale_partners(b2b_contact_id);

CREATE TABLE IF NOT EXISTS presale_event_links (
  campaign_id uuid NOT NULL REFERENCES presale_campaigns(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, event_id)
);

ALTER TABLE presale_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE presale_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY presale_partners_rw ON presale_partners FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
CREATE POLICY presale_event_links_rw ON presale_event_links FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager','tsa'));
