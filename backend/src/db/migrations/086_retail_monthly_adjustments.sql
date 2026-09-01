-- 086_retail_monthly_adjustments.sql
-- Per-month retail gross / discount / rewards totals, so the Trends chart can
-- stack net + discount + rewards = gross. retail_sales stores only the NET line
-- amount, so the discount/rewards given away aren't recoverable per row; we keep
-- the monthly totals here instead. The sales importer upserts (adds) a file's
-- deltas after a successful, non-duplicate import; backfilled from the SAIL
-- exports for Jan–Jul 2026.

CREATE TABLE IF NOT EXISTS retail_monthly_adjustments (
  studio_id  uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  month      text NOT NULL,                       -- 'YYYY-MM'
  gross      numeric(12,2) NOT NULL DEFAULT 0,     -- Price × Qty (list)
  discount   numeric(12,2) NOT NULL DEFAULT 0,
  rewards    numeric(12,2) NOT NULL DEFAULT 0,     -- rewards redeemed
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, month)
);
-- net = gross − discount − rewards, and equals SUM(retail_sales.total_price).

ALTER TABLE retail_monthly_adjustments ENABLE ROW LEVEL SECURITY;
