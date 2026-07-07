-- 055_multistudio_scoping_backfill.sql
-- Adds studio_id to tables that were previously global, closing cross-studio
-- data leaks in SOPs, cleaning task library, feedback signals, and AI advisor cache.
--
-- All pre-existing rows predate the Madison studio (which has 1 member and no
-- data in these tables), so they are backfilled to HOTWORX Pewaukee.
--   Pewaukee WI0009 = 3abc6af6-37b8-4c13-b761-a92b5204ca25

BEGIN;

-- ── SOPs ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sops
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES public.studios(id);
UPDATE public.sops
  SET studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
  WHERE studio_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sops_studio ON public.sops(studio_id);

-- ── Cleaning task library ────────────────────────────────────────────────────
ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES public.studios(id);
UPDATE public.cleaning_tasks
  SET studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
  WHERE studio_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_studio ON public.cleaning_tasks(studio_id);

-- ── Feedback signals (feed the AI advisor) ───────────────────────────────────
ALTER TABLE public.feedback_signals
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES public.studios(id);
UPDATE public.feedback_signals
  SET studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
  WHERE studio_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_signals_studio ON public.feedback_signals(studio_id);

-- ── AI advisor cache ─────────────────────────────────────────────────────────
ALTER TABLE public.advisor_cache
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES public.studios(id);
UPDATE public.advisor_cache
  SET studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
  WHERE studio_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_advisor_cache_studio ON public.advisor_cache(studio_id, month, year);

COMMIT;
