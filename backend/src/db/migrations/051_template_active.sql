-- Let Script Admin add/delete templates. Deleting a seeded default can't be a
-- hard delete (seedTemplates would re-insert it on the next load), so deletion
-- is a soft flag: the row stays (keeping seedTemplates from respawning it) but
-- is hidden from the Scripts list. Custom (user-added) templates use the same flag.
ALTER TABLE onboarding_touchpoint_templates
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
