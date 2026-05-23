-- Migration 010: Events & Promotions

CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  event_type  TEXT NOT NULL DEFAULT 'in-store'
    CHECK (event_type IN ('in-store','community','corporate','partnership','online','other')),
  start_date  DATE NOT NULL,
  end_date    DATE,
  start_time  TIME,
  end_time    TIME,
  location    TEXT,
  notes       TEXT,
  month       INTEGER NOT NULL,
  year        INTEGER NOT NULL,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  promo_type     TEXT NOT NULL DEFAULT 'discount'
    CHECK (promo_type IN ('discount','free_session','referral','flash_sale','bundle','other')),
  discount_value NUMERIC(10,2),
  discount_unit  TEXT DEFAULT '%' CHECK (discount_unit IN ('%','$','free','other')),
  start_date     DATE,
  end_date       DATE,
  ongoing        BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  month          INTEGER NOT NULL,
  year           INTEGER NOT NULL,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- Events: owner/manager can edit; TSA can view
CREATE POLICY "events_select" ON events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
CREATE POLICY "events_update" ON events FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
CREATE POLICY "events_delete" ON events FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));

-- Promotions: same
CREATE POLICY "promos_select" ON promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "promos_insert" ON promotions FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
CREATE POLICY "promos_update" ON promotions FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
CREATE POLICY "promos_delete" ON promotions FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
