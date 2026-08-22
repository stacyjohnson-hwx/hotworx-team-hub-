-- Sponsor Desk sharing model: brands + their outreach/samples + success are shared
-- across an owner's studios; orders + events stay studio-specific.
-- Multi-tenant safe: a studio with no org_id falls back to its own id (isolated),
-- so other franchisees never see each other's brands.

ALTER TABLE studios ADD COLUMN IF NOT EXISTS org_id uuid;
-- Pewaukee + Madison are one owner → share a pipeline (Pewaukee's id is the org id).
UPDATE studios SET org_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25' WHERE code IN ('WI0009','WI0021');

-- Brands become org-scoped (touches/samples ride along via brand_id).
ALTER TABLE sponsor_brands ADD COLUMN IF NOT EXISTS org_id uuid;
UPDATE sponsor_brands b SET org_id = COALESCE(s.org_id, s.id)
  FROM studios s WHERE s.id = b.studio_id AND b.org_id IS NULL;
ALTER TABLE sponsor_brands DROP CONSTRAINT IF EXISTS sponsor_brands_studio_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsor_brands_org_name ON sponsor_brands(org_id, name);
CREATE INDEX IF NOT EXISTS idx_sponsor_brands_org_stage ON sponsor_brands(org_id, stage);

-- Orders are studio-specific.
ALTER TABLE sponsor_orders ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES studios(id) ON DELETE CASCADE;
UPDATE sponsor_orders o SET studio_id = b.studio_id
  FROM sponsor_brands b WHERE b.id = o.brand_id AND o.studio_id IS NULL;

-- Rebuild the rollup so b.* carries org_id (column set changed → drop + recreate).
DROP VIEW IF EXISTS v_sponsor_brand_rollup;
CREATE VIEW v_sponsor_brand_rollup AS
SELECT b.*,
  (SELECT max(occurred_on) FROM sponsor_touches t WHERE t.brand_id = b.id)                    AS last_touch_on,
  (SELECT count(*)         FROM sponsor_touches t WHERE t.brand_id = b.id)                    AS touch_count,
  (SELECT max(received_on) FROM sponsor_samples s WHERE s.brand_id = b.id)                    AS last_sample_on,
  (SELECT coalesce(sum(retail_value),0) FROM sponsor_samples s WHERE s.brand_id = b.id)       AS donated_value,
  (SELECT max(ordered_on)  FROM sponsor_orders o WHERE o.brand_id = b.id)                     AS last_order_on,
  (SELECT coalesce(sum(cost),0) FROM sponsor_orders o WHERE o.brand_id = b.id)                AS total_spend,
  (SELECT count(*) FROM sponsor_orders o WHERE o.brand_id = b.id)                             AS order_count,
  (SELECT count(DISTINCT eb.event_id) FROM sponsor_event_brands eb WHERE eb.brand_id = b.id)  AS event_count
FROM sponsor_brands b;

-- Brands RLS → org scope (a Madison user sees Pewaukee-added brands and vice-versa).
DROP POLICY IF EXISTS sponsor_brands_by_studio ON sponsor_brands;
CREATE POLICY sponsor_brands_by_org ON sponsor_brands FOR ALL
  USING (org_id IN (SELECT COALESCE(s.org_id, s.id) FROM studios s JOIN user_studios us ON us.studio_id = s.id WHERE us.user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT COALESCE(s.org_id, s.id) FROM studios s JOIN user_studios us ON us.studio_id = s.id WHERE us.user_id = auth.uid()));
