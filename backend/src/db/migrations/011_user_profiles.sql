-- Migration 011: User Profiles
-- Stores photo, contact info, motivation quiz answers, onboarding state per user.

CREATE TABLE IF NOT EXISTS user_profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name               TEXT,
  phone                   TEXT,
  birthday                DATE,
  avatar_url              TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_completed_at TIMESTAMPTZ,
  quiz_answers            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at_user_profiles()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_user_profiles();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own profile
CREATE POLICY "profiles_own_access" ON user_profiles
  FOR ALL TO authenticated
  USING  ( (select auth.uid()) = id )
  WITH CHECK ( (select auth.uid()) = id );

-- Manager/owner can read all profiles
CREATE POLICY "profiles_manager_read" ON user_profiles
  FOR SELECT TO authenticated
  USING ( (select auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager') );

-- Manager/owner can write all profiles (for user management)
CREATE POLICY "profiles_manager_write" ON user_profiles
  FOR ALL TO authenticated
  USING  ( (select auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager') )
  WITH CHECK ( (select auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager') );
