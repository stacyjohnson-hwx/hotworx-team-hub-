-- Migration 007: Goals (studio + personal) and daily leads

-- Studio-wide monthly KPIs
CREATE TABLE IF NOT EXISTS studio_goals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month      INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year       INTEGER NOT NULL,

  -- EFT (Electronic Funds Transfer increase)
  eft_target            NUMERIC(10,2) NOT NULL DEFAULT 500,
  eft_actual            NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- New memberships
  memberships_target    INTEGER NOT NULL DEFAULT 0,
  memberships_actual    INTEGER NOT NULL DEFAULT 0,

  -- Retail sales
  retail_target         NUMERIC(10,2) NOT NULL DEFAULT 0,
  retail_actual         NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Performance rates (percentages)
  conversion_rate_target    NUMERIC(5,2) NOT NULL DEFAULT 35,
  conversion_rate_actual    NUMERIC(5,2) NOT NULL DEFAULT 0,
  checkin_show_rate_target  NUMERIC(5,2) NOT NULL DEFAULT 80,
  checkin_show_rate_actual  NUMERIC(5,2) NOT NULL DEFAULT 0,
  close_rate_target         NUMERIC(5,2) NOT NULL DEFAULT 50,
  close_rate_actual         NUMERIC(5,2) NOT NULL DEFAULT 0,

  notes      TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, year)
);

ALTER TABLE studio_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_goals_select" ON studio_goals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "studio_goals_insert" ON studio_goals
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));

CREATE POLICY "studio_goals_update" ON studio_goals
  FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));


-- Per-TSA personal monthly goals and actuals
CREATE TABLE IF NOT EXISTS personal_goals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tsa_id     UUID NOT NULL REFERENCES auth.users(id),
  month      INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year       INTEGER NOT NULL,

  -- EFT & POS
  eft_actual       NUMERIC(10,2) NOT NULL DEFAULT 0,
  pos_collected    NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Paid-In-Full memberships collected
  pif_6mo          NUMERIC(10,2) NOT NULL DEFAULT 0,
  pif_12mo         NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Retail
  retail_actual    NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- ITB Bonus override (null = auto-calculate)
  itb_bonus_override NUMERIC(10,2),
  itb_bonus_note   TEXT,

  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tsa_id, month, year)
);

ALTER TABLE personal_goals ENABLE ROW LEVEL SECURITY;

-- TSA sees own; owner/manager sees all
CREATE POLICY "personal_goals_select" ON personal_goals
  FOR SELECT TO authenticated
  USING (
    tsa_id = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager')
  );

CREATE POLICY "personal_goals_insert" ON personal_goals
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));

CREATE POLICY "personal_goals_update" ON personal_goals
  FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));


-- Daily lead count (one row per day for the studio)
CREATE TABLE IF NOT EXISTS leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_date  DATE NOT NULL UNIQUE,
  count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  notes      TEXT,
  entered_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select" ON leads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leads_insert" ON leads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "leads_update" ON leads
  FOR UPDATE TO authenticated USING (true);
