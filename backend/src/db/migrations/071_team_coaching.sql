-- Monthly Planner "Team Coaching" tab: per-employee action-item checklist (with
-- due dates) and a running 1:1 notes log. Keyed to the subject employee, owner/
-- manager only. Distinct names from the meetings "coaching" module's tables.
CREATE TABLE IF NOT EXISTS team_coaching_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,       -- the employee being coached
  text text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_coaching_items_subject ON team_coaching_items(studio_id, subject_user_id);

CREATE TABLE IF NOT EXISTS team_coaching_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  note text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_coaching_notes_subject ON team_coaching_notes(studio_id, subject_user_id);

ALTER TABLE team_coaching_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coaching_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_coaching_items_ownermgr ON team_coaching_items FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
CREATE POLICY team_coaching_notes_ownermgr ON team_coaching_notes FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','manager'));
