-- ============================================================================
-- Migration: Fix studio_trends unique constraint for multi-studio
-- ============================================================================

-- The unique constraint was (month, year) but needs to be (studio_id, month, year)
-- to allow different studios to have data for the same month/year

ALTER TABLE studio_trends
DROP CONSTRAINT IF EXISTS studio_trends_month_year_key;

ALTER TABLE studio_trends
ADD CONSTRAINT studio_trends_studio_month_year_key
UNIQUE (studio_id, month, year);

-- ============================================================================
-- This allows Pewaukee and Madison to each have their own June 2026 record
-- ============================================================================
