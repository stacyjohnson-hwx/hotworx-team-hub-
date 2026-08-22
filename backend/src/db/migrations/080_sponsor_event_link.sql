-- Link a sponsor activation to a real studio calendar event (Events & Promos /
-- Pre-Sale use the `events` table). Optional — standalone sponsor events still allowed.
-- One calendar event maps to at most one sponsor event.
ALTER TABLE sponsor_events ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsor_events_event ON sponsor_events(event_id) WHERE event_id IS NOT NULL;
