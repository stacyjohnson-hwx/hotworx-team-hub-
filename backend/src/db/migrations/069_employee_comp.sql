-- Team ROI (owner-only): compare each employee's labor cost (wage + commission)
-- vs the revenue they bring in. The revenue + commission + hours data already
-- exist; the only new data is a pay rate per employee and an optional monthly
-- hours override. Owner-only — all access is via the backend service client
-- behind requireRole('owner'); RLS below is defense-in-depth.

-- Current pay setup per employee per studio.
CREATE TABLE IF NOT EXISTS employee_comp (
  studio_id      uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pay_type       text NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'salary')),
  hourly_rate    numeric(10,2),         -- $/hr when pay_type = 'hourly'
  monthly_salary numeric(10,2),         -- flat $/month when pay_type = 'salary'
  active         boolean NOT NULL DEFAULT true,   -- false = exclude from the ROI table
  updated_by     uuid REFERENCES auth.users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, user_id)
);

-- Optional per-month hours override. Blank ⇒ fall back to scheduled hours (shifts).
CREATE TABLE IF NOT EXISTS employee_hours_actual (
  studio_id  uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month      int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  year       int  NOT NULL,
  hours      numeric(6,2),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, user_id, month, year)
);

ALTER TABLE employee_comp          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_hours_actual  ENABLE ROW LEVEL SECURITY;

-- Owner-only visibility at the DB layer (pay data). The backend uses the service
-- role which bypasses RLS; these policies protect any direct anon/authenticated access.
DROP POLICY IF EXISTS employee_comp_owner ON employee_comp;
CREATE POLICY employee_comp_owner ON employee_comp
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');

DROP POLICY IF EXISTS employee_hours_actual_owner ON employee_hours_actual;
CREATE POLICY employee_hours_actual_owner ON employee_hours_actual
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner');
