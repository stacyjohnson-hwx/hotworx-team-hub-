-- 091_leadgen_completion_unique.sql
-- Prevent a lead-gen play from being completed twice on the same day by the same
-- staffer (which double-awarded contest points). The route is also idempotent
-- per period; this is the DB backstop against concurrent double-taps.

ALTER TABLE leadgen_completions
  ADD CONSTRAINT leadgen_completions_unique_per_day
  UNIQUE (studio_id, play_id, staff_id, completion_date);
