-- 074_member_geo.sql
-- Street-level coordinates for members/leads so the Heat Map can plot individual
-- addresses (for flyering) alongside the ZIP-density view.
-- Filled by the US Census batch geocoder; see POST /api/member-activation/geo/geocode.

ALTER TABLE public.onboarding_members
  ADD COLUMN IF NOT EXISTS latitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geo_precision TEXT,          -- 'rooftop' | 'zip' | null
  ADD COLUMN IF NOT EXISTS geocoded_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_onboarding_members_geo
  ON public.onboarding_members(studio_id) WHERE latitude IS NOT NULL;
