-- 085_retail_purchase_orders.sql
-- Retail restock / purchasing orders. A purchase order records what was bought
-- from a vendor, the price paid per item (bulk discounts flow through), and the
-- order total (with tax/shipping). On create it cross-posts a summary row into
-- the operational `orders` table (category=retail, status=ordered). Stock is
-- added to inventory_levels only when the PO is marked "received".

CREATE TABLE IF NOT EXISTS retail_purchase_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  vendor_id       uuid REFERENCES vendors(id),
  vendor_name     text NOT NULL,
  status          text NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered','received','cancelled')),
  subtotal        numeric(10,2) NOT NULL DEFAULT 0,  -- sum of line items (price paid)
  tax             numeric(10,2) NOT NULL DEFAULT 0,
  shipping        numeric(10,2) NOT NULL DEFAULT 0,
  total           numeric(10,2) NOT NULL DEFAULT 0,  -- amount actually paid -> orders.est_cost
  notes           text,
  linked_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_by      uuid,
  ordered_at      timestamptz NOT NULL DEFAULT now(),
  received_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpo_studio ON retail_purchase_orders(studio_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS retail_purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES retail_purchase_orders(id) ON DELETE CASCADE,
  sku_id            uuid NOT NULL REFERENCES sku_master(id),
  product_name      text,               -- snapshot for display
  quantity          int NOT NULL DEFAULT 0,
  size_quantities   jsonb,              -- per-size counts for apparel
  unit_cost         numeric(10,2) NOT NULL DEFAULT 0,  -- price paid per item
  line_total        numeric(10,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpoi_po ON retail_purchase_order_items(purchase_order_id);

-- Access is via the Express API using the service-role key (RLS bypassed);
-- studio scoping + owner/manager guards are enforced in middleware. RLS is
-- enabled as defense-in-depth with no public policies.
ALTER TABLE retail_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_purchase_order_items ENABLE ROW LEVEL SECURITY;
