-- 034_tsa_certification.sql
-- TSA Certification & Skill Mastery System.
--   Library (SHARED across studios — the studio playbook):
--     skill_category, skill, script (versioned), quiz_question
--   Per-TSA progress (studio-scoped):
--     tsa_skill_status, quiz_attempt, live_demo_result, coaching_feedback
--
-- Mastery ladder: not_started → learning → ready_to_test → certified → needs_recert.
-- Stage 1 = written quiz (system-gated). Stage 2 = live demo (Lead-gated).
-- Editing a script to a new version flips Certified rows on that skill → needs_recert.
--
-- RLS is enabled on all tables with no client policies; the backend uses the
-- service_role key (consistent with the rest of the app). Already applied live.

CREATE TABLE IF NOT EXISTS skill_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, sort_order INT DEFAULT 0, active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES skill_category(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort_order INT DEFAULT 0, active BOOLEAN DEFAULT TRUE,
  pass_threshold INT DEFAULT 80, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS script (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skill(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1, body TEXT, video_url TEXT,
  is_current BOOLEAN DEFAULT TRUE, updated_by UUID, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quiz_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skill(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (type IN ('multiple_choice','short_recall')),
  prompt TEXT NOT NULL, choices JSONB, correct_answer TEXT NOT NULL, sort_order INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tsa_skill_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  tsa_user_id UUID NOT NULL, skill_id UUID NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','learning','ready_to_test','certified','needs_recert')),
  certified_on DATE, certified_by UUID, current_script_version INT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (studio_id, tsa_user_id, skill_id)
);
CREATE TABLE IF NOT EXISTS quiz_attempt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  tsa_user_id UUID NOT NULL, skill_id UUID NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  score INT, passed BOOLEAN, taken_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS live_demo_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  tsa_user_id UUID NOT NULL, skill_id UUID NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
  lead_user_id UUID, result TEXT CHECK (result IN ('pass','fail')),
  rubric_scores JSONB, feedback_note TEXT, tested_on DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coaching_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  tsa_user_id UUID NOT NULL, lead_user_id UUID, skill_id UUID REFERENCES skill(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'general' CHECK (source IN ('live_demo','coaching_session','general')),
  note TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE skill_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill ENABLE ROW LEVEL SECURITY;
ALTER TABLE script ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsa_skill_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_demo_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_feedback ENABLE ROW LEVEL SECURITY;
GRANT ALL ON skill_category, skill, script, quiz_question, tsa_skill_status,
  quiz_attempt, live_demo_result, coaching_feedback TO service_role;

NOTIFY pgrst, 'reload schema';
