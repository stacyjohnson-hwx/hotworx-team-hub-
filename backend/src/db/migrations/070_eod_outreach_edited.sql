-- The EOD "Member Outreach Completed" numbers are now recomputed live at report
-- time (end of day) so late-day work is captured — unless someone hand-edited them
-- on the checkout, in which case their typed values win. This flag records that.
ALTER TABLE eod_submissions
  ADD COLUMN IF NOT EXISTS outreach_edited boolean NOT NULL DEFAULT false;
