-- CFO Dashboard (PRD). Expense spine + benchmark bands + member movement + marketing.
-- Every table ships RLS-enabled and studio_id-scoped at creation (PRD §13 standing rule).

CREATE TABLE IF NOT EXISTS monthly_pnl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  period_year int NOT NULL, period_month int NOT NULL,
  gl_account text NOT NULL,                 -- QuickBooks account name, verbatim
  category text,                            -- maps to benchmark_targets.category
  amount numeric NOT NULL DEFAULT 0,
  cost_behavior text CHECK (cost_behavior IN ('fixed','semi_fixed','semi_variable','variable')),
  line_position text NOT NULL DEFAULT 'operating' CHECK (line_position IN ('operating','below_ebitda','non_pnl')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('quickbooks','computed','manual')),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, period_year, period_month, gl_account)
);
CREATE INDEX IF NOT EXISTS idx_monthly_pnl_period ON monthly_pnl(studio_id, period_year, period_month);

CREATE TABLE IF NOT EXISTS benchmark_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid REFERENCES studios(id) ON DELETE CASCADE,  -- null = applies to all studios
  category text NOT NULL,
  label text,
  target_low_pct numeric, target_high_pct numeric,
  direction text CHECK (direction IN ('lower_is_better','higher_is_better')),
  denominator text NOT NULL DEFAULT 'total_revenue',       -- total_revenue | retail_revenue
  applies_from_month int NOT NULL DEFAULT 0,                -- ramp studios exempt until month N
  sort_order int NOT NULL DEFAULT 0,
  rationale text
);

CREATE TABLE IF NOT EXISTS member_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  period_year int NOT NULL, period_month int NOT NULL,
  starting int, joined int, cancelled int, frozen int, ending int,
  arpu numeric, churn_pct numeric, avg_member_life_months numeric,
  UNIQUE (studio_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  period_year int NOT NULL, period_month int NOT NULL,
  channel text NOT NULL,                    -- meta | organic | referral | b2b | events | print
  spend numeric DEFAULT 0, leads int DEFAULT 0, tours int DEFAULT 0, closes int DEFAULT 0,
  cost_per_lead numeric, cac numeric, campaign_ref text,
  UNIQUE (studio_id, period_year, period_month, channel)
);

ALTER TABLE monthly_pnl ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY monthly_pnl_scoped ON monthly_pnl FOR ALL
  USING (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));
CREATE POLICY member_movement_scoped ON member_movement FOR ALL
  USING (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));
CREATE POLICY marketing_spend_scoped ON marketing_spend FOR ALL
  USING (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));
CREATE POLICY benchmark_targets_scoped ON benchmark_targets FOR ALL
  USING (studio_id IS NULL OR studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()))
  WITH CHECK (studio_id IS NULL OR studio_id IN (SELECT studio_id FROM user_studios WHERE user_id = auth.uid()));

-- Seed the global benchmark bands (PRD §5). % of revenue unless denominator says otherwise.
INSERT INTO benchmark_targets (studio_id, category, label, target_low_pct, target_high_pct, direction, denominator, sort_order, rationale)
SELECT * FROM (VALUES
  (NULL::uuid, 'membership_eft', 'Membership EFT', 78, 88, 'higher_is_better', 'total_revenue', 1, 'The only line that compounds'),
  (NULL, 'retail', 'Retail + upgrades', 10, 16, 'higher_is_better', 'total_revenue', 2, 'Top of band is good'),
  (NULL, 'retail_cogs', 'Retail COGS', 45, 55, 'lower_is_better', 'retail_revenue', 3, '50%+ retail margin'),
  (NULL, 'payroll', 'Payroll + taxes', 20, 28, 'lower_is_better', 'total_revenue', 4, 'Low-labor model; 30% is a big-box number'),
  (NULL, 'occupancy', 'Occupancy (rent + CAM)', 12, 18, 'lower_is_better', 'total_revenue', 5, 'Locked at lease signing'),
  (NULL, 'utilities', 'Utilities', 4, 7, 'lower_is_better', 'total_revenue', 6, 'Infrared load; watch summer peaks'),
  (NULL, 'virtual_instructor', 'Virtual instructor fee', 2, 4, 'lower_is_better', 'total_revenue', 7, 'Scales with sauna count'),
  (NULL, 'marketing', 'Local marketing', 10, 14, 'lower_is_better', 'total_revenue', 8, 'Contract floor: greater of $2,000 or 10% of gross'),
  (NULL, 'merchant_fees', 'Merchant + bank fees', 2.5, 3.5, 'lower_is_better', 'total_revenue', 9, 'Scales with draft volume'),
  (NULL, 'software_pos', 'POS / software', 1, 2.5, 'lower_is_better', 'total_revenue', 10, 'SAIL + stack'),
  (NULL, 'insurance', 'Insurance', 1, 2, 'lower_is_better', 'total_revenue', 11, ''),
  (NULL, 'repairs_supplies', 'R&M + supplies', 2, 5, 'lower_is_better', 'total_revenue', 12, 'Lumpy; normalize over 12 mo'),
  (NULL, 'admin_professional', 'Admin / legal / accounting', 1, 3, 'lower_is_better', 'total_revenue', 13, ''),
  (NULL, 'ebitda', 'EBITDA', 20, 30, 'higher_is_better', 'total_revenue', 20, 'Operating performance')
) AS v(studio_id, category, label, target_low_pct, target_high_pct, direction, denominator, sort_order, rationale)
WHERE NOT EXISTS (SELECT 1 FROM benchmark_targets b WHERE b.studio_id IS NULL AND b.category = v.category);
