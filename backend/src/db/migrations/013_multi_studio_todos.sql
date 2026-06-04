-- ============================================================================
-- Migration: Add studio_id to todo_items for multi-studio support
-- ============================================================================

-- Add studio_id to todo_items
ALTER TABLE todo_items
ADD COLUMN IF NOT EXISTS studio_id uuid REFERENCES studios(id);

-- Create index for faster studio-filtered queries
CREATE INDEX IF NOT EXISTS idx_todo_items_studio_id
ON todo_items(studio_id);

-- Migrate existing data to Pewaukee (WI0009) if studio_id is NULL
UPDATE todo_items
SET studio_id = (SELECT id FROM studios WHERE code = 'WI0009')
WHERE studio_id IS NULL;

-- Make studio_id required going forward
ALTER TABLE todo_items
ALTER COLUMN studio_id SET NOT NULL;

-- ============================================================================
-- Note: Backend routes already filter by studio_id via requireStudio middleware
-- This migration ensures the database structure supports multi-studio operations
-- ============================================================================
