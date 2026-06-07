-- ============================================================================
-- Migration: Retail Intelligence System - Phase 1 (SKU Catalog)
-- ============================================================================

-- Product categories
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  minimum_order_qty INTEGER,
  avg_lead_days INTEGER DEFAULT 14,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SKU Master Record
CREATE TABLE IF NOT EXISTS sku_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES product_categories(id),
  vendor_id UUID REFERENCES vendors(id),

  -- Pricing
  retail_price NUMERIC(10,2),
  wholesale_cost NUMERIC(10,2),

  -- Product attributes
  has_sizes BOOLEAN DEFAULT false,
  available_sizes TEXT[], -- ['XS','S','M','L','XL','XXL']
  image_url TEXT,

  -- Inventory settings (per SKU, not per location)
  par_level INTEGER DEFAULT 0,
  reorder_quantity INTEGER DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Scraper metadata
  scraped_at TIMESTAMPTZ,
  scrape_source TEXT, -- 'retail' or 'wholesale'

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Location-specific inventory levels
CREATE TABLE IF NOT EXISTS inventory_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES sku_master(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,

  -- Current quantities
  quantity_on_hand INTEGER DEFAULT 0,

  -- Size breakdown (only for SKUs with has_sizes=true)
  size_quantities JSONB, -- {"XS": 2, "S": 5, "M": 8, "L": 5, "XL": 2, "XXL": 1}

  -- Last updated
  last_count_date DATE,
  last_updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(sku_id, studio_id)
);

-- Scraper staging table (for preview before publishing)
CREATE TABLE IF NOT EXISTS sku_scraper_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT NOT NULL,
  product_name TEXT,
  description TEXT,
  retail_price NUMERIC(10,2),
  wholesale_cost NUMERIC(10,2),
  image_url TEXT,
  available_sizes TEXT[],
  scrape_source TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  published BOOLEAN DEFAULT false,
  matched_sku_id UUID REFERENCES sku_master(id),

  -- Raw scraped data for debugging
  raw_data JSONB
);

-- Indexes
CREATE INDEX idx_sku_master_category ON sku_master(category_id);
CREATE INDEX idx_sku_master_vendor ON sku_master(vendor_id);
CREATE INDEX idx_sku_master_active ON sku_master(active);
CREATE INDEX idx_inventory_levels_studio ON inventory_levels(studio_id);
CREATE INDEX idx_inventory_levels_sku ON inventory_levels(sku_id);

-- RLS Policies
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_scraper_staging ENABLE ROW LEVEL SECURITY;

-- Categories: All authenticated users can view
CREATE POLICY "Categories visible to authenticated users"
  ON product_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners and managers can manage categories"
  ON product_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- Vendors: All authenticated users can view
CREATE POLICY "Vendors visible to authenticated users"
  ON vendors FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners and managers can manage vendors"
  ON vendors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- SKU Master: All authenticated users can view
CREATE POLICY "SKUs visible to authenticated users"
  ON sku_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners and managers can manage SKUs"
  ON sku_master FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- Inventory Levels: Studio-specific
CREATE POLICY "Users can view inventory for their studios"
  ON inventory_levels FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND studio_id = inventory_levels.studio_id
    )
  );

CREATE POLICY "Owners and managers can update inventory"
  ON inventory_levels FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND studio_id = inventory_levels.studio_id
      AND role IN ('owner', 'manager')
    )
  );

-- Scraper Staging: Owner/Manager only
CREATE POLICY "Owners and managers can access scraper staging"
  ON sku_scraper_staging FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_studios
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'manager')
    )
  );

-- Seed default categories
INSERT INTO product_categories (name, sort_order) VALUES
  ('Apparel - Tops', 10),
  ('Apparel - Bottoms', 20),
  ('Apparel - Accessories', 30),
  ('Supplements', 40),
  ('Equipment', 50),
  ('Retail - Other', 60)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Phase 1 complete - SKU catalog foundation ready
-- ============================================================================
