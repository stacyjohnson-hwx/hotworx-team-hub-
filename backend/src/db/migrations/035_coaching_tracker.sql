-- 035_coaching_tracker.sql
-- Coaching & role-play tracker (owner/manager-facing) for the Sales Certification
-- module. Tracks whether 1:1 coaching is happening and each team member's
-- trajectory, to support keep/grow/exit decisions.
--   coaching_log         : one row per coaching/role-play session per employee
--   coaching_dev_status  : current development status per employee (one row)
--
-- RLS enabled, no client policies; backend uses the service_role key. Applied live.

CREATE TABLE IF NOT EXISTS coaching_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL,
  coach_user_id UUID,
  met_on DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT '1_on_1'
    CHECK (type IN ('1_on_1','role_play','ride_along','review','check_in')),
  skill_id UUID REFERENCES skill(id) ON DELETE SET NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  wins TEXT, focus TEXT, action_items TEXT,
  next_session_on DATE, created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coaching_dev_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'on_track'
    CHECK (status IN ('thriving','on_track','needs_improvement','at_risk')),
  status_note TEXT, updated_by UUID, updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (studio_id, employee_user_id)
);

ALTER TABLE coaching_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_dev_status ENABLE ROW LEVEL SECURITY;
GRANT ALL ON coaching_log, coaching_dev_status TO service_role;

NOTIFY pgrst, 'reload schema';
