-- ============================================================================
-- Migration: Retail Intelligence System - Phase 2 (Inventory Count Interface)
-- ============================================================================

-- Count sessions (one per monthly count)
CREATE TABLE IF NOT EXISTS inventory_count_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,

  -- Session metadata
  count_date DATE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  counted_by UUID NOT NULL REFERENCES auth.users(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),

  -- Summary stats (calculated on submission)
  total_items INTEGER DEFAULT 0,
  items_counted INTEGER DEFAULT 0,
  total_variance_value NUMERIC(10,2) DEFAULT 0,
  shrinkage_rate NUMERIC(5,2) DEFAULT 0, -- percentage

  -- Manager notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual item counts within a session
CREATE TABLE IF NOT EXISTS inventory_count_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES inventory_count_sessions(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,

  -- Count data
  expected_quantity INTEGER NOT NULL DEFAULT 0,
  actual_quantity INTEGER,

  -- Size-level counts (for apparel)
  expected_size_quantities JSONB, -- {"XS": 2, "S": 5, ...}
  actual_size_quantities JSONB,   -- {"XS": 1, "S": 6, ...}

  -- Variance
  variance INTEGER GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
  variance_value NUMERIC(10,2), -- variance * retail_price

  -- Flags and notes
  flagged BOOLEAN DEFAULT false,
  notes TEXT,
  photo_url TEXT,

  -- Audit
  counted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, sku_id)
);

-- Count entry revisions (audit trail for corrections)
CREATE TABLE IF NOT EXISTS inventory_count_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES inventory_count_entries(id) ON DELETE CASCADE,

  -- What changed
  field_name TEXT NOT NULL, -- 'actual_quantity' or 'actual_size_quantities'
  old_value JSONB,
  new_value JSONB,
  reason TEXT,

  -- Who and when
  revised_by UUID NOT NULL REFERENCES auth.users(id),
  revised_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_count_sessions_studio ON inventory_count_sessions(studio_id);
CREATE INDEX idx_count_sessions_date ON inventory_count_sessions(count_date);
CREATE INDEX idx_count_sessions_status ON inventory_count_sessions(status);
CREATE INDEX idx_count_entries_session ON inventory_count_entries(session_id);
CREATE INDEX idx_count_entries_sku ON inventory_count_entries(sku_id);
CREATE INDEX idx_count_revisions_entry ON inventory_count_revisions(entry_id);

-- RLS Policies
ALTER TABLE inventory_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_revisions ENABLE ROW LEVEL SECURITY;

-- Count Sessions: Studio-specific
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_sessions'
    AND policyname = 'Users can view count sessions for their studios'
  ) THEN
    CREATE POLICY "Users can view count sessions for their studios"
      ON inventory_count_sessions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = inventory_count_sessions.studio_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_sessions'
    AND policyname = 'Owners and managers can manage count sessions'
  ) THEN
    CREATE POLICY "Owners and managers can manage count sessions"
      ON inventory_count_sessions FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = inventory_count_sessions.studio_id
          AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- Count Entries: Through session studio
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_entries'
    AND policyname = 'Users can view count entries for their studios'
  ) THEN
    CREATE POLICY "Users can view count entries for their studios"
      ON inventory_count_entries FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM inventory_count_sessions s
          JOIN user_studios us ON us.studio_id = s.studio_id
          WHERE s.id = inventory_count_entries.session_id
          AND us.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_entries'
    AND policyname = 'Owners and managers can manage count entries'
  ) THEN
    CREATE POLICY "Owners and managers can manage count entries"
      ON inventory_count_entries FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM inventory_count_sessions s
          JOIN user_studios us ON us.studio_id = s.studio_id
          WHERE s.id = inventory_count_entries.session_id
          AND us.user_id = auth.uid()
          AND us.role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- Count Revisions: Through entry session studio
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_revisions'
    AND policyname = 'Users can view count revisions for their studios'
  ) THEN
    CREATE POLICY "Users can view count revisions for their studios"
      ON inventory_count_revisions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM inventory_count_entries e
          JOIN inventory_count_sessions s ON s.id = e.session_id
          JOIN user_studios us ON us.studio_id = s.studio_id
          WHERE e.id = inventory_count_revisions.entry_id
          AND us.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_count_revisions'
    AND policyname = 'Owners and managers can create count revisions'
  ) THEN
    CREATE POLICY "Owners and managers can create count revisions"
      ON inventory_count_revisions FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM inventory_count_entries e
          JOIN inventory_count_sessions s ON s.id = e.session_id
          JOIN user_studios us ON us.studio_id = s.studio_id
          WHERE e.id = inventory_count_revisions.entry_id
          AND us.user_id = auth.uid()
          AND us.role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- Phase 2 complete - Inventory count session management ready
-- ============================================================================
