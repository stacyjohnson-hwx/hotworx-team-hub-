-- Migration 009: B2B Outreach Tracker + Orders

-- ─── B2B Contacts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS b2b_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  industry      TEXT,

  status TEXT NOT NULL DEFAULT 'new_lead'
    CHECK (status IN ('new_lead','contacted','meeting_scheduled','active_partner','follow_up','not_interested')),

  -- Discount partner fields
  discount_desc    TEXT,          -- e.g. "20% off memberships"
  discount_ongoing BOOLEAN NOT NULL DEFAULT FALSE,  -- auto-carry each month

  next_action      TEXT,
  next_action_date DATE,
  notes            TEXT,

  assigned_to UUID REFERENCES auth.users(id),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS b2b_interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES b2b_contacts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('call','email','visit','meeting','other')),
  notes       TEXT,
  logged_by   UUID REFERENCES auth.users(id),
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE b2b_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_interactions ENABLE ROW LEVEL SECURITY;

-- Owner/manager: full access. TSA: see only contacts assigned to them.
CREATE POLICY "b2b_contacts_select" ON b2b_contacts FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
    OR assigned_to = auth.uid()
  );

CREATE POLICY "b2b_contacts_insert" ON b2b_contacts FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

CREATE POLICY "b2b_contacts_update" ON b2b_contacts FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

CREATE POLICY "b2b_contacts_delete" ON b2b_contacts FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

CREATE POLICY "b2b_interactions_select" ON b2b_interactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "b2b_interactions_insert" ON b2b_interactions FOR INSERT TO authenticated
  WITH CHECK (logged_by = auth.uid());

CREATE POLICY "b2b_interactions_delete" ON b2b_interactions FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

-- ─── Orders ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name   TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  category    TEXT NOT NULL DEFAULT 'supplies'
    CHECK (category IN ('supplies','retail','equipment','marketing','other')),
  notes       TEXT,
  vendor      TEXT,
  est_cost    NUMERIC(10,2),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','ordered','received','cancelled')),

  requested_by UUID REFERENCES auth.users(id),
  approved_by  UUID REFERENCES auth.users(id),
  ordered_at   TIMESTAMPTZ,
  received_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- TSA can see pending + their own; owner/manager see all
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
    OR requested_by = auth.uid()
    OR status = 'pending'
  );

-- Anyone can request
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Only owner/manager can update status
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
