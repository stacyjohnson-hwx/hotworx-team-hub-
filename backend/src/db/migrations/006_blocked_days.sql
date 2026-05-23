-- Migration 006: Blocked days (holidays, studio closures)

CREATE TABLE IF NOT EXISTS blocked_days (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_date DATE NOT NULL UNIQUE,
  label      TEXT NOT NULL DEFAULT 'Holiday',
  block_type TEXT NOT NULL DEFAULT 'holiday' CHECK (block_type IN ('holiday', 'blocked')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE blocked_days ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view blocked days
CREATE POLICY "blocked_days_select" ON blocked_days
  FOR SELECT TO authenticated USING (true);

-- Only owner/manager can create
CREATE POLICY "blocked_days_insert" ON blocked_days
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));

-- Only owner/manager can delete
CREATE POLICY "blocked_days_delete" ON blocked_days
  FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager'));
