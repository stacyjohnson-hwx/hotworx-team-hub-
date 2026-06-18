-- 037_quiz_explanation.sql
-- Adds an explanation to quiz questions, shown to the TSA after they answer.

ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS explanation TEXT;

NOTIFY pgrst, 'reload schema';
