-- EOD Shift Checkout submissions
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS eod_submissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by          UUID NOT NULL REFERENCES auth.users(id),
  shift_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_type            TEXT NOT NULL CHECK (shift_type IN ('opening', 'mid', 'closing')),

  -- Drawer count
  drawer_start          NUMERIC(10,2) NOT NULL DEFAULT 0,
  cash_collected        NUMERIC(10,2) NOT NULL DEFAULT 0,
  credit_collected      NUMERIC(10,2) NOT NULL DEFAULT 0,
  drawer_end            NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Leads
  leads_count           INT NOT NULL DEFAULT 0,
  leads_notes           TEXT,

  -- Sales
  new_memberships       INT NOT NULL DEFAULT 0,
  eft_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  retail_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  sales_notes           TEXT,

  -- Sales training engagement
  watched_training_video BOOLEAN NOT NULL DEFAULT FALSE,
  used_sales_gpt        BOOLEAN NOT NULL DEFAULT FALSE,
  called_leads          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Orders & notes
  orders_needed         TEXT,
  general_notes         TEXT,

  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One submission per person per shift type per day
  UNIQUE (submitted_by, shift_date, shift_type)
);

-- Row Level Security
ALTER TABLE eod_submissions ENABLE ROW LEVEL SECURITY;

-- TSAs can read/insert their own; Owner + Manager can read all
CREATE POLICY "eod_select_own" ON eod_submissions
  FOR SELECT USING (
    auth.uid() = submitted_by OR
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager')
  );

CREATE POLICY "eod_insert_own" ON eod_submissions
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

-- Owner + Manager can update any submission (e.g. to add notes)
CREATE POLICY "eod_update_manager" ON eod_submissions
  FOR UPDATE USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner', 'manager')
  );
