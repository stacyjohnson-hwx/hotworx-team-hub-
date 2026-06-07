-- ============================================================================
-- Migration: Retail Intelligence System - Phase 3 (Sales Analytics)
-- ============================================================================

-- Sales transactions (imported from POS)
CREATE TABLE IF NOT EXISTS retail_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,

  -- Transaction data
  sale_date DATE NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

  -- Size breakdown (for apparel)
  size_quantities JSONB, -- {"S": 1, "M": 2, "L": 1}

  -- Import metadata
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES auth.users(id),
  import_batch_id UUID,

  -- Raw data for debugging
  raw_data JSONB
);

-- Sales import batches (track CSV uploads)
CREATE TABLE IF NOT EXISTS sales_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,

  -- Batch metadata
  file_name TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID NOT NULL REFERENCES auth.users(id),

  -- Stats
  total_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,

  -- Validation errors
  errors JSONB
);

-- Shrinkage analysis (calculated from count sessions + sales)
CREATE TABLE IF NOT EXISTS shrinkage_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,

  -- Analysis period
  from_count_session_id UUID REFERENCES inventory_count_sessions(id),
  to_count_session_id UUID REFERENCES inventory_count_sessions(id),
  analysis_date DATE NOT NULL,

  -- Calculated values
  starting_quantity INTEGER NOT NULL,
  sales_quantity INTEGER NOT NULL,
  expected_ending_quantity INTEGER NOT NULL,
  actual_ending_quantity INTEGER NOT NULL,

  -- Shrinkage
  shrinkage_quantity INTEGER GENERATED ALWAYS AS (expected_ending_quantity - actual_ending_quantity) STORED,
  shrinkage_value NUMERIC(10,2),
  shrinkage_rate NUMERIC(5,2), -- percentage

  -- Flags
  consecutive_shrinkage_count INTEGER DEFAULT 0,
  flagged BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dead stock tracking
CREATE TABLE IF NOT EXISTS dead_stock_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,

  -- Analysis snapshot
  analysis_date DATE NOT NULL,
  days_since_last_sale INTEGER,
  last_sale_date DATE,
  quantity_on_hand INTEGER NOT NULL,
  retail_value NUMERIC(10,2),

  -- Classification
  status TEXT CHECK (status IN ('active', 'slow_mover', 'dead_stock')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Size sell-through analysis
CREATE TABLE IF NOT EXISTS size_sellthrough_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,

  -- Analysis period
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  analysis_date DATE NOT NULL,

  -- Size-level data (one row per size)
  size_name TEXT NOT NULL, -- 'XS', 'S', 'M', etc.
  units_sold INTEGER NOT NULL,
  percentage_of_total NUMERIC(5,2), -- % of total sales for this SKU
  days_to_sell NUMERIC(6,2), -- average velocity
  current_inventory INTEGER DEFAULT 0,

  -- Recommended order split
  recommended_percentage NUMERIC(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_retail_sales_studio ON retail_sales(studio_id);
CREATE INDEX IF NOT EXISTS idx_retail_sales_sku ON retail_sales(sku_id);
CREATE INDEX IF NOT EXISTS idx_retail_sales_date ON retail_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_retail_sales_batch ON retail_sales(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_batches_studio ON sales_import_batches(studio_id);
CREATE INDEX IF NOT EXISTS idx_shrinkage_analysis_studio ON shrinkage_analysis(studio_id);
CREATE INDEX IF NOT EXISTS idx_shrinkage_analysis_sku ON shrinkage_analysis(sku_id);
CREATE INDEX IF NOT EXISTS idx_dead_stock_studio ON dead_stock_analysis(studio_id);
CREATE INDEX IF NOT EXISTS idx_dead_stock_status ON dead_stock_analysis(status);
CREATE INDEX IF NOT EXISTS idx_size_sellthrough_studio ON size_sellthrough_analysis(studio_id);
CREATE INDEX IF NOT EXISTS idx_size_sellthrough_sku ON size_sellthrough_analysis(sku_id);

-- RLS Policies
ALTER TABLE retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shrinkage_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_stock_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE size_sellthrough_analysis ENABLE ROW LEVEL SECURITY;

-- Retail Sales: Studio-specific
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'retail_sales'
    AND policyname = 'Users can view sales for their studios'
  ) THEN
    CREATE POLICY "Users can view sales for their studios"
      ON retail_sales FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = retail_sales.studio_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'retail_sales'
    AND policyname = 'Owners and managers can manage sales'
  ) THEN
    CREATE POLICY "Owners and managers can manage sales"
      ON retail_sales FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = retail_sales.studio_id
          AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- Sales Import Batches: Studio-specific
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales_import_batches'
    AND policyname = 'Users can view import batches for their studios'
  ) THEN
    CREATE POLICY "Users can view import batches for their studios"
      ON sales_import_batches FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = sales_import_batches.studio_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sales_import_batches'
    AND policyname = 'Owners and managers can manage import batches'
  ) THEN
    CREATE POLICY "Owners and managers can manage import batches"
      ON sales_import_batches FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = sales_import_batches.studio_id
          AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- Analysis tables: Same pattern
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'shrinkage_analysis'
    AND policyname = 'Users can view shrinkage analysis for their studios'
  ) THEN
    CREATE POLICY "Users can view shrinkage analysis for their studios"
      ON shrinkage_analysis FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = shrinkage_analysis.studio_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dead_stock_analysis'
    AND policyname = 'Users can view dead stock for their studios'
  ) THEN
    CREATE POLICY "Users can view dead stock for their studios"
      ON dead_stock_analysis FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = dead_stock_analysis.studio_id
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'size_sellthrough_analysis'
    AND policyname = 'Users can view size analysis for their studios'
  ) THEN
    CREATE POLICY "Users can view size analysis for their studios"
      ON size_sellthrough_analysis FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_studios
          WHERE user_id = auth.uid()
          AND studio_id = size_sellthrough_analysis.studio_id
        )
      );
  END IF;
END $$;

-- ============================================================================
-- Phase 3 complete - Sales analytics and shrinkage detection ready
-- ============================================================================
