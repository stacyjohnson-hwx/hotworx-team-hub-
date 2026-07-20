-- Add a "closed" (deal done / partnership secured) status to B2B contacts.
-- Closed vendors are excluded from the follow-up queue (see GET /api/b2b/followups).
ALTER TABLE b2b_contacts DROP CONSTRAINT IF EXISTS b2b_contacts_status_check;
ALTER TABLE b2b_contacts ADD CONSTRAINT b2b_contacts_status_check
  CHECK (status = ANY (ARRAY['new_lead','contacted','meeting_scheduled','follow_up','closed','not_interested']::text[]));
