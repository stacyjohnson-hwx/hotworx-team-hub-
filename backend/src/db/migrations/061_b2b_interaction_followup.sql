-- B2B interactions double as follow-up tasks: an optional future date (and a done
-- flag) lets a logged interaction schedule the next touch, replacing the old
-- per-contact next_action / next_action_date fields.
ALTER TABLE b2b_interactions
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_done boolean NOT NULL DEFAULT false;
