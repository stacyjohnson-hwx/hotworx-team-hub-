-- EOD "Member Outreach Completed" — six editable counts of outreach the team
-- actually DID today (auto-filled from Member Activation, adjustable at checkout),
-- plus their sum shown on the checkout + emailed report. Counts of what was DONE,
-- not what is due.
ALTER TABLE eod_submissions
  ADD COLUMN IF NOT EXISTS outreach_birthday     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_thank_you    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_missed_guest int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_reengage14   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_milestones   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_new_member   int NOT NULL DEFAULT 0;
