-- Sales skills revamp: managers rate each person's skill red/yellow/green (a training
-- heatmap) instead of pass/fail certifications. Reuses the per-(studio,tsa,skill) row.
ALTER TABLE tsa_skill_status ADD COLUMN IF NOT EXISTS skill_level text CHECK (skill_level IN ('red','yellow','green'));
ALTER TABLE tsa_skill_status ADD COLUMN IF NOT EXISTS level_note text;
ALTER TABLE tsa_skill_status ADD COLUMN IF NOT EXISTS level_set_by uuid;
ALTER TABLE tsa_skill_status ADD COLUMN IF NOT EXISTS level_set_at timestamptz;
