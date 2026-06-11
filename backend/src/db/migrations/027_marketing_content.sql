-- 027_marketing_content.sql
-- Marketing Hub Phase 2: Content Library. Uploaded photos/videos live in the
-- 'marketing-content' Supabase Storage bucket; this table holds their metadata
-- (who, which task, member, category, approval status, Ready-for-SOCi flag).

CREATE TABLE IF NOT EXISTS marketing_content_assets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id      UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_id       UUID NOT NULL REFERENCES auth.users(id),
  task_id        UUID REFERENCES marketing_tasks(id) ON DELETE SET NULL,
  completion_id  UUID REFERENCES marketing_task_completions(id) ON DELETE SET NULL,
  file_url       TEXT,
  file_path      TEXT,
  file_type      TEXT NOT NULL DEFAULT 'photo' CHECK (file_type IN ('photo','video','testimonial','text')),
  category       TEXT NOT NULL DEFAULT 'member_photos',
  member_name    TEXT,
  caption        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','flagged','archived')),
  ready_for_soci BOOLEAN NOT NULL DEFAULT FALSE,
  posted_link    TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE marketing_content_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mkt_content_studio ON marketing_content_assets (studio_id, uploaded_at DESC);

-- Storage bucket created via the dashboard/SQL:
--   INSERT INTO storage.buckets (id, name, public, file_size_limit)
--   VALUES ('marketing-content','marketing-content', true, 104857600);
-- with authenticated INSERT/SELECT/UPDATE/DELETE policies scoped to that bucket.
