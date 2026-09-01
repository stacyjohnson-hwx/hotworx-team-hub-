-- 088_retail_sales_detail_columns.sql
-- Surface the full monthly retail spreadsheet detail on each sale line so the
-- Analytics → Sales Data view can show Member, Gross, Discount and Rewards, and
-- so net revenue (gross − discount − rewards) reconciles per-line.
--
-- These columns were first applied directly to the live DB during the net
-- re-import; this migration makes them reproducible for other studios / fresh
-- databases. Idempotent via IF NOT EXISTS.

ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS member_name text;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS discount numeric(10,2) DEFAULT 0;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS rewards numeric(10,2) DEFAULT 0;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS method_of_sale text;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS wholesale_amount numeric(10,2);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS gross_profit numeric(10,2);
