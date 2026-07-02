-- Capture the SAIL cancellation export's own fields so the Cancellations tab
-- mirrors what's in SAIL: package, monthly payment, cancellation type, and the
-- subscription (join) date. The free-text SAIL reason still lands in
-- reason_notes; cancel_reason is the bucketed category (see mapCancelReason).
ALTER TABLE cancellation_log
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS monthly_payment numeric,
  ADD COLUMN IF NOT EXISTS cancellation_type text,
  ADD COLUMN IF NOT EXISTS subscription_date date;

-- SAIL auto-cancels for non-payment; add it as a first-class reason bucket.
ALTER TABLE cancellation_log DROP CONSTRAINT IF EXISTS cancellation_log_cancel_reason_check;
ALTER TABLE cancellation_log ADD CONSTRAINT cancellation_log_cancel_reason_check
  CHECK (cancel_reason = ANY (ARRAY['non_payment','cost','not_using','no_results','moving','medical','unhappy','competitor','other']::text[]));
