-- Sales tax collected (pass-through liability — tracked, not counted as revenue).
ALTER TABLE studio_trends ADD COLUMN IF NOT EXISTS sales_tax numeric NOT NULL DEFAULT 0;
