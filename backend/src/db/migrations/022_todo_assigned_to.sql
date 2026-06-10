-- 022_todo_assigned_to.sql
-- Assign a To-Do item to a specific manager/owner (so each manager has their own
-- named list). Items can be pushed to a person from Coaching, Maintenance, and
-- Escalations. Legacy items have assigned_to = NULL and appear under "Unassigned".

ALTER TABLE todo_items
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_todo_assigned ON todo_items (studio_id, assigned_to);
