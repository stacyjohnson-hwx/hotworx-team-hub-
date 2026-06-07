-- ============================================================================
-- Migration: SOPs - Add visibility and status
-- ============================================================================

-- Add visibility and status columns to sops table
ALTER TABLE sops
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'all' CHECK (visibility IN ('all', 'manager_only')),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'live'));

-- Update existing SOPs to be live and visible to all (preserve existing behavior)
UPDATE sops SET visibility = 'all', status = 'live' WHERE visibility IS NULL OR status IS NULL;

-- Drop existing RLS policies (SOPs is not multi-studio currently, uses shared policies)
DROP POLICY IF EXISTS "SOPs visible to authenticated users" ON sops;
DROP POLICY IF EXISTS "Owners and managers can manage SOPs" ON sops;

-- New RLS policies with visibility and status filtering
CREATE POLICY "Users can view live SOPs"
  ON sops FOR SELECT
  TO authenticated
  USING (
    (status = 'live' AND visibility = 'all')
    OR
    -- Managers/owners can see everything (draft + manager_only)
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can manage SOPs"
  ON sops FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- ============================================================================
-- SOPs visibility and status complete
-- ============================================================================
