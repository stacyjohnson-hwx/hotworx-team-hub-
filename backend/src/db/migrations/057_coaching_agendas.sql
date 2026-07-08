-- 057_coaching_agendas.sql
-- Moves meeting agendas (and their attached documents) off browser localStorage /
-- IndexedDB and into the database + Supabase Storage, so agendas are shared across
-- devices and users and can't be lost when a browser clears its storage.

CREATE TABLE IF NOT EXISTS public.coaching_agendas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     UUID NOT NULL REFERENCES public.studios(id),
  meeting_type  TEXT NOT NULL DEFAULT 'manager_meeting',
  meeting_date  DATE,
  meeting_time  TEXT,                       -- 'HH:MM' (nullable)
  title         TEXT NOT NULL,
  attendees     TEXT,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id,text,checked,isDefault}]
  documents     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id,name,size,type,url,path,uploaded_at}]
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_agendas_studio_date
  ON public.coaching_agendas(studio_id, meeting_date);

ALTER TABLE public.coaching_agendas ENABLE ROW LEVEL SECURITY;
-- No policies: all access is via the backend service-role client (like the rest
-- of the app), which bypasses RLS. RLS-on/no-policy denies direct client access.

-- Storage bucket for agenda documents (public, matching the app's other buckets;
-- object paths are prefixed with random ids so URLs are not guessable).
INSERT INTO storage.buckets (id, name, public)
VALUES ('coaching-docs', 'coaching-docs', true)
ON CONFLICT (id) DO NOTHING;
