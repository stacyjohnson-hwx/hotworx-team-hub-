-- Universal per-task follow-up date for the Daily List. onboarding_touchpoint_log already
-- holds per-(member, task) notes + done; adding a follow_up_date turns it into the single
-- log for every Daily List task type — a future date snoozes the task until then.
ALTER TABLE onboarding_touchpoint_log ADD COLUMN IF NOT EXISTS follow_up_date date;
