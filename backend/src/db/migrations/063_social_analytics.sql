-- Social Analytics module (PRD §5). We own the time series: platform APIs return
-- current counts, a nightly job snapshots them here, and all deltas are computed
-- from snapshots. The dashboard reads only from these tables. Multi-studio from
-- day one (studio_id everywhere).
CREATE TABLE IF NOT EXISTS social_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  platform text NOT NULL,              -- instagram | facebook | tiktok | google
  handle text,
  external_id text,                    -- IG user id / FB page id / TikTok open id / GBP location id
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, platform)
);
CREATE TABLE IF NOT EXISTS channel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  followers int,
  rating numeric(2,1),                 -- google only
  review_count int,                    -- google only
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, snapshot_date)
);
CREATE TABLE IF NOT EXISTS content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  platform text,
  external_id text,
  caption text,
  media_type text,                     -- reel | video | image | carousel
  posted_at timestamptz,
  permalink text,
  thumb_url text,
  UNIQUE (channel_id, external_id)
);
CREATE TABLE IF NOT EXISTS post_metrics (
  post_id uuid PRIMARY KEY REFERENCES content_posts(id) ON DELETE CASCADE,
  views int, likes int, comments int, shares int, saves int,
  follows_driven int,                  -- ESTIMATE unless UTM-attributed (PRD §7)
  is_estimate boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS post_teardowns (
  post_id uuid PRIMARY KEY REFERENCES content_posts(id) ON DELETE CASCADE,
  hook text, value text, cta text, why text,
  transcript text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_channels_studio ON social_channels(studio_id);
CREATE INDEX IF NOT EXISTS idx_channel_snapshots_ch_date ON channel_snapshots(channel_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_content_posts_channel ON content_posts(channel_id);
