-- 087_eod_auto_submit.sql
-- Auto-submitted EOD fallback. If no closing EOD is entered by 8:30 PM CT, a cron
-- creates an 'auto' end-of-day record so every operating day still has a history
-- entry. New shift_type 'auto' (never collides with a real opening/mid/closing on
-- the (submitted_by, shift_date, shift_type) unique key) + an auto_submitted flag.

ALTER TABLE eod_submissions ADD COLUMN IF NOT EXISTS auto_submitted boolean NOT NULL DEFAULT false;

ALTER TABLE eod_submissions DROP CONSTRAINT IF EXISTS eod_submissions_shift_type_check;
ALTER TABLE eod_submissions ADD CONSTRAINT eod_submissions_shift_type_check
  CHECK (shift_type = ANY (ARRAY['opening','mid','closing','auto']));
