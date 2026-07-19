-- Trends module — external niche content discovery + AI teardowns.
-- External posts can't live in content_posts (channel_id is a NOT NULL FK to the
-- studio's OWN social_channels), so trends gets its own tables. Studio-scoped.
-- Column shapes mirror content_posts / post_teardowns so the Social Analytics UI
-- (ContentRow) renders trend items unchanged.
CREATE TABLE IF NOT EXISTS trend_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  platform text NOT NULL,                 -- instagram | tiktok
  kind text NOT NULL,                     -- hashtag | account | keyword
  query text NOT NULL,                    -- '#infraredworkout' | '@creator' | 'infrared sauna workout'
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, platform, kind, query)
);
CREATE TABLE IF NOT EXISTS trend_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  platform text NOT NULL,
  source_id uuid REFERENCES trend_sources(id) ON DELETE SET NULL,
  external_id text NOT NULL,
  url text, thumb_url text, caption text,
  author_handle text, author_followers int,
  posted_at timestamptz,
  views int, likes int, comments int, shares int, saves int,
  virality_score numeric NOT NULL DEFAULT 0,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, platform, external_id)
);
CREATE TABLE IF NOT EXISTS trend_teardowns (
  trend_post_id uuid PRIMARY KEY REFERENCES trend_posts(id) ON DELETE CASCADE,
  hook text, value text, cta text, why_it_works text,
  format text, trending_sound text, content_pillar text,
  steal_this jsonb,                       -- { concept, shot_list[], onscreen_hook, caption }
  effort text,                            -- low | medium | high
  transcript text, model text,
  status text NOT NULL DEFAULT 'ok',      -- ok | unavailable
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trend_posts_studio_score ON trend_posts(studio_id, virality_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_posts_discovered ON trend_posts(studio_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_sources_studio ON trend_sources(studio_id);
