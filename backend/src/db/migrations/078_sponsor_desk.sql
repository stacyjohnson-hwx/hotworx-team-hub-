-- Sample, Sponsor & Vendor Desk — a CRM for sourcing free product from brands.
-- Studio-scoped; RLS uses user_studios (this app's membership table), not studio_users.
-- All tables created up front (child FKs need them); Phase 1 UI uses brands + children.

CREATE TABLE IF NOT EXISTS sponsor_brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name          text NOT NULL,
  domain        text,
  category      text NOT NULL DEFAULT 'other'
                CHECK (category IN ('protein_bar','electrolyte','energy_drink','protein_shake','snack','recovery','other')),
  stage         text NOT NULL DEFAULT 'prospect'
                CHECK (stage IN ('prospect','contacted','talking','committed','received','partner','dormant','passed')),
  ask_level     text NOT NULL DEFAULT 'none'
                CHECK (ask_level IN ('none','product','attend','ongoing','paid')),
  contact_type  text NOT NULL DEFAULT 'unknown'
                CHECK (contact_type IN ('corporate','distributor','local_rep','unknown')),
  owner_user_id uuid,
  contact_name  text, contact_title text, email text, phone text, social_handle text,
  next_action_at date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, name)
);

CREATE TABLE IF NOT EXISTS sponsor_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name        text NOT NULL,
  event_date  date NOT NULL,
  location    text, event_type text, attendance integer, leads_collected integer,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsor_touches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid NOT NULL REFERENCES sponsor_brands(id) ON DELETE CASCADE,
  occurred_on date NOT NULL DEFAULT current_date,
  channel    text NOT NULL CHECK (channel IN ('email','web_form','instagram_dm','phone','in_person','linkedin')),
  by_user_id uuid, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsor_samples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES sponsor_brands(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES sponsor_events(id) ON DELETE SET NULL,
  received_on   date NOT NULL DEFAULT current_date,
  item          text NOT NULL, quantity integer DEFAULT 0, retail_value numeric(10,2) DEFAULT 0,
  used_for      text CHECK (used_for IN ('event','member_swag','retail_test','staff','prize_bundle')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsor_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES sponsor_brands(id) ON DELETE CASCADE,
  ordered_on  date NOT NULL DEFAULT current_date,
  item        text NOT NULL, quantity integer DEFAULT 0, cost numeric(10,2) DEFAULT 0,
  source      text CHECK (source IN ('direct','distributor','retail','club')),
  external_ref text, note text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsor_event_brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES sponsor_events(id) ON DELETE CASCADE,
  brand_id   uuid NOT NULL REFERENCES sponsor_brands(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('hour_sponsor','product_donation','prize_bundle','giveaway','paid_sponsor')),
  slot       text, item text,
  status     text NOT NULL DEFAULT 'asked' CHECK (status IN ('asked','confirmed','delivered','no_show','declined')),
  UNIQUE (event_id, brand_id, role)
);

CREATE TABLE IF NOT EXISTS sponsor_givebacks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES sponsor_events(id) ON DELETE CASCADE,
  brand_id     uuid NOT NULL REFERENCES sponsor_brands(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('ig_post','ig_story','reel_collab','email_mention','signage','sampling_report','lead_share')),
  due_on       date, completed_at timestamptz, proof_url text, note text
);

CREATE INDEX IF NOT EXISTS idx_sponsor_brands_studio_stage ON sponsor_brands (studio_id, stage);
CREATE INDEX IF NOT EXISTS idx_sponsor_brands_next ON sponsor_brands (next_action_at) WHERE stage <> 'passed';
CREATE INDEX IF NOT EXISTS idx_sponsor_touches_brand ON sponsor_touches (brand_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_samples_brand ON sponsor_samples (brand_id, received_on DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_orders_brand ON sponsor_orders (brand_id, ordered_on DESC);
CREATE INDEX IF NOT EXISTS idx_sponsor_givebacks_open ON sponsor_givebacks (event_id) WHERE completed_at IS NULL;

-- Rollup view — metrics are computed, never stored.
CREATE OR REPLACE VIEW v_sponsor_brand_rollup AS
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

-- RLS (defense-in-depth; the API uses the service role + studio_id filters).
ALTER TABLE sponsor_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_event_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_givebacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY sponsor_brands_by_studio ON sponsor_brands FOR ALL
  USING (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));
CREATE POLICY sponsor_events_by_studio ON sponsor_events FOR ALL
  USING (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));
CREATE POLICY sponsor_touches_by_studio ON sponsor_touches FOR ALL
  USING (brand_id IN (SELECT id FROM sponsor_brands)) WITH CHECK (brand_id IN (SELECT id FROM sponsor_brands));
CREATE POLICY sponsor_samples_by_studio ON sponsor_samples FOR ALL
  USING (brand_id IN (SELECT id FROM sponsor_brands)) WITH CHECK (brand_id IN (SELECT id FROM sponsor_brands));
CREATE POLICY sponsor_orders_by_studio ON sponsor_orders FOR ALL
  USING (brand_id IN (SELECT id FROM sponsor_brands)) WITH CHECK (brand_id IN (SELECT id FROM sponsor_brands));
CREATE POLICY sponsor_event_brands_by_studio ON sponsor_event_brands FOR ALL
  USING (event_id IN (SELECT id FROM sponsor_events)) WITH CHECK (event_id IN (SELECT id FROM sponsor_events));
CREATE POLICY sponsor_givebacks_by_studio ON sponsor_givebacks FOR ALL
  USING (event_id IN (SELECT id FROM sponsor_events)) WITH CHECK (event_id IN (SELECT id FROM sponsor_events));
