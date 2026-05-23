-- Schedule (shifts) + Time Off Requests
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tsa_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_date  DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_off_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','denied')),
  reviewed_by   UUID REFERENCES auth.users(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on shifts
DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests    ENABLE ROW LEVEL SECURITY;

-- Shifts: all authenticated users can read; owner/manager can write
CREATE POLICY "shifts_select" ON shifts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "shifts_insert" ON shifts
  FOR INSERT WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "shifts_update" ON shifts
  FOR UPDATE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "shifts_delete" ON shifts
  FOR DELETE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

-- Time off: TSA can read/insert own; owner/manager can read all and update status
CREATE POLICY "timeoff_select_own" ON time_off_requests
  FOR SELECT USING (
    auth.uid() = requested_by OR
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "timeoff_insert_own" ON time_off_requests
  FOR INSERT WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "timeoff_update_manager" ON time_off_requests
  FOR UPDATE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager')
  );

CREATE POLICY "timeoff_delete_own" ON time_off_requests
  FOR DELETE USING (
    auth.uid() = requested_by AND status = 'pending'
  );
