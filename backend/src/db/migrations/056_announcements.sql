-- Dashboard announcements feed: owner/manager posts with rich text + images,
-- everyone can react with emoji (Instagram-style engagement).
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text,
  content_html text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{url, path}]
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_feed
  ON announcements (studio_id, pinned DESC, created_at DESC);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (announcement_id, user_id, emoji)
);
ALTER TABLE announcement_reactions ENABLE ROW LEVEL SECURITY;
-- Service-role backend only; no anon/authenticated policies (RLS-on = deny by default).
