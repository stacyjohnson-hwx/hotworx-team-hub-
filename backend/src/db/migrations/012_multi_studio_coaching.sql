-- ============================================================================
-- Migration: Add studio_id to coaching tables for multi-studio support
-- ============================================================================

-- Add studio_id to coaching_sessions
ALTER TABLE coaching_sessions
ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES studios(id);

-- Add studio_id to coaching_action_items
ALTER TABLE coaching_action_items
ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES studios(id);

-- Create indexes for faster studio-filtered queries
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_studio_id
ON coaching_sessions(studio_id);

CREATE INDEX IF NOT EXISTS idx_coaching_action_items_studio_id
ON coaching_action_items(studio_id);

-- Migrate existing data to Pewaukee (WI0009) if studio_id is NULL
UPDATE coaching_sessions
SET studio_id = (SELECT id FROM studios WHERE code = 'WI0009')
WHERE studio_id IS NULL;

UPDATE coaching_action_items
SET studio_id = (SELECT id FROM studios WHERE code = 'WI0009')
WHERE studio_id IS NULL;

-- Make studio_id required going forward
ALTER TABLE coaching_sessions
ALTER COLUMN studio_id SET NOT NULL;

ALTER TABLE coaching_action_items
ALTER COLUMN studio_id SET NOT NULL;

-- ============================================================================
-- Note: Backend routes already filter by studio_id via requireStudio middleware
-- This migration ensures the database structure supports multi-studio operations
-- ============================================================================
