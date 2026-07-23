-- 075_territory_radius.sql
-- Per-zone size for canvassing territories, so a large subdivision and a single
-- apartment building can be drawn (and counted) at their real footprint instead
-- of sharing one global radius. NULL = fall back to the map's radius control.

ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS radius_m INTEGER;
