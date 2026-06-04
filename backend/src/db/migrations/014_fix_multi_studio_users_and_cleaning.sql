-- ============================================================================
-- Migration: Fix multi-studio users and cleaning completions constraint
-- ============================================================================

-- 1. Migrate all existing users to Pewaukee studio
-- Only migrate users who aren't already in user_studios and aren't former employees
INSERT INTO user_studios (user_id, studio_id, role)
SELECT
  u.id,
  (SELECT id FROM studios WHERE code = 'WI0009') as studio_id,
  COALESCE(u.raw_app_meta_data->>'role', 'tsa') as role
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM user_studios)
AND u.email NOT LIKE '%.former@%'
ON CONFLICT (user_id, studio_id) DO NOTHING;

-- 2. Fix cleaning_completions unique constraint to include studio_id
-- Old constraint was (task_id, completion_date) which caused conflicts
-- New constraint is (studio_id, task_id, completion_date) for multi-studio support

ALTER TABLE cleaning_completions
DROP CONSTRAINT IF EXISTS cleaning_completions_task_id_completion_date_key;

ALTER TABLE cleaning_completions
ADD CONSTRAINT cleaning_completions_studio_task_date_key
UNIQUE (studio_id, task_id, completion_date);

-- ============================================================================
-- This fixes two issues:
-- 1. Team members disappeared after multi-studio migration
-- 2. "no unique constraint" error when completing cleaning tasks
-- ============================================================================
