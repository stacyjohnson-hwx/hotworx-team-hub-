-- Canonical DDL for studios + user_studios (they predate the migrations directory and
-- were created by hand in Supabase), plus per-studio config columns used by the
-- multi-tenant provisioning portal. Idempotent: a no-op on production (tables/columns
-- may already exist) and a full schema for fresh/branch databases.

CREATE TABLE IF NOT EXISTS public.studios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL,
  name       text NOT NULL,
  address    text,
  timezone   text DEFAULT 'America/Chicago',
  latitude   numeric,
  longitude  numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Studio-level config (nullable; consumed by later phases: branding, per-studio email
-- recipients, goal thresholds, and account status).
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS brand_accent        text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS brand_accent_soft   text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS logo_url            text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS notification_emails jsonb;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS goal_thresholds     jsonb;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS status              text DEFAULT 'active';

-- One studio per code (provisioning also checks this in app code for a friendly 409).
CREATE UNIQUE INDEX IF NOT EXISTS studios_code_key ON public.studios (code);

CREATE TABLE IF NOT EXISTS public.user_studios (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id  uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  role       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, studio_id)
);

-- NOTE: RLS state and SELECT policies for these two tables already exist in production
-- (StudioContext reads them with the user's JWT). This migration deliberately does NOT
-- touch RLS, to avoid breaking those reads.
