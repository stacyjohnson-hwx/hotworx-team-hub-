-- Manual check-off + notes for new-member onboarding touchpoints. Layered over
-- the engine-computed status: a touchpoint shows done if the engine says so OR
-- a log row marks it done. The Daily List also hides day-based tasks logged done.
CREATE TABLE IF NOT EXISTS onboarding_touchpoint_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES onboarding_members(id) ON DELETE CASCADE,
  touchpoint_key text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  notes text,
  completed_by text,
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (studio_id, member_id, touchpoint_key)
);
ALTER TABLE onboarding_touchpoint_log ENABLE ROW LEVEL SECURITY;
-- Service-role backend only; no anon/authenticated policies (RLS-on = deny by default).
