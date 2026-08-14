-- Canvassing-plan stops can be a business (b2b_contact) OR a neighborhood (territory).
ALTER TABLE presale_canvass_stops ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES territories(id) ON DELETE CASCADE;
ALTER TABLE presale_canvass_stops ALTER COLUMN b2b_contact_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_canvass_stops_territory ON presale_canvass_stops(plan_id, territory_id) WHERE territory_id IS NOT NULL;
