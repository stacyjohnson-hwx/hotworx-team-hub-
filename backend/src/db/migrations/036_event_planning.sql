-- 036_event_planning.sql
-- Planning fields on events: Goal, Marketing Plan, and a Supplies checklist
-- (jsonb array of { id, text, checked }). Supplies items can be pushed to the
-- Manager To-Do list from the event card.

ALTER TABLE events ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS marketing_plan TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS supplies JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
