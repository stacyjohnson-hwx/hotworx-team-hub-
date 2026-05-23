-- Migration 008: Expand personal_goals + create studio_trends

-- ─── Personal goals: new fields ────────────────────────────────────────────

ALTER TABLE personal_goals
  ADD COLUMN IF NOT EXISTS sweat_basic         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sweat_elite         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_memberships   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_made          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS texts_made          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_eft_bonus_override NUMERIC(10,2);

-- ─── Studio monthly trends (comprehensive) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_trends (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year  INTEGER NOT NULL,

  -- Revenue ($)
  vending          NUMERIC(10,2) DEFAULT 0,
  retail           NUMERIC(10,2) DEFAULT 0,
  rewards          NUMERIC(10,2) DEFAULT 0,
  refunds          NUMERIC(10,2) DEFAULT 0,
  membership_cash  NUMERIC(10,2) DEFAULT 0,
  net_eft          NUMERIC(10,2) DEFAULT 0,
  eft_increase     NUMERIC(10,2) DEFAULT 0,
  eft_decrease     NUMERIC(10,2) DEFAULT 0,
  net_eft_increase NUMERIC(10,2) DEFAULT 0,
  in_the_bank      NUMERIC(10,2) DEFAULT 0,
  itb_goal         NUMERIC(10,2) DEFAULT 0,    -- manager ITB commission threshold
  expenses         NUMERIC(10,2) DEFAULT 0,
  net_income       NUMERIC(10,2) DEFAULT 0,

  -- Membership counts (#)
  leads              INTEGER DEFAULT 0,
  red_appts_booked   INTEGER DEFAULT 0,
  red_appts_held     INTEGER DEFAULT 0,
  new_members        INTEGER DEFAULT 0,
  cancellations      INTEGER DEFAULT 0,
  total_member_count INTEGER DEFAULT 0,

  -- Social / reviews (#)
  instagram_followers INTEGER DEFAULT 0,
  facebook_followers  INTEGER DEFAULT 0,
  tiktok_followers    INTEGER DEFAULT 0,
  five_star_reviews   INTEGER DEFAULT 0,

  -- Activity (#)
  calls_made INTEGER DEFAULT 0,
  texts_made INTEGER DEFAULT 0,

  -- Free-text
  manager_notes TEXT,

  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, year)
);

ALTER TABLE studio_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_trends_select" ON studio_trends
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "studio_trends_insert" ON studio_trends
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));

CREATE POLICY "studio_trends_update" ON studio_trends
  FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));
