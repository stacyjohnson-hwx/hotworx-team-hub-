-- 092_b2b_followup_task_type.sql
-- Add a 'task' interaction type for standalone follow-up reminders.
--
-- A 'task' row carries a follow_up_date and represents a SCHEDULED reminder, not a
-- past outreach touch. It is deliberately excluded from the "last contacted" / recency
-- calculation and does not advance a contact's stage (see backend/src/routes/b2b.js).
--
-- Applied live via Supabase; this file is the repo record of that change.

ALTER TABLE b2b_interactions DROP CONSTRAINT IF EXISTS b2b_interactions_type_check;

ALTER TABLE b2b_interactions ADD CONSTRAINT b2b_interactions_type_check
  CHECK (type = ANY (ARRAY[
    'call'::text, 'email'::text, 'visit'::text, 'meeting'::text,
    'collab'::text, 'drop'::text, 'dm'::text, 'other'::text, 'task'::text
  ]));
