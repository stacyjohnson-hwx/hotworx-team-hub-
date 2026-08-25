-- B2B pipeline relabel: "Meeting Scheduled" → "Collab Scheduled", "Follow Up" →
-- "Maintain Partnership" (label-only, values unchanged), and drop the "closed" status.
-- No rows used 'closed' at migration time, so no data move is needed.
ALTER TABLE b2b_contacts DROP CONSTRAINT IF EXISTS b2b_contacts_status_check;
ALTER TABLE b2b_contacts ADD CONSTRAINT b2b_contacts_status_check
  CHECK (status IN ('new_lead','contacted','meeting_scheduled','follow_up','not_interested'));
