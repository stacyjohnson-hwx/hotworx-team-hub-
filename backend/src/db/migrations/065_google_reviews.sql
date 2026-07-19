-- Per-channel deep-dive dashboards: pull the actual Google reviews + an AI theme
-- summary (what people love / recurring issues). Reviews are public, so Apify's
-- Google Maps scraper can return them without the GBP API.
CREATE TABLE IF NOT EXISTS google_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL,
  external_id text NOT NULL,             -- Google reviewId (or author+date fallback)
  author_name text,
  rating int,                            -- 1-5
  text text,
  review_date timestamptz,
  owner_response text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, external_id)
);
CREATE TABLE IF NOT EXISTS google_review_insights (
  studio_id uuid PRIMARY KEY,
  summary text,
  loves jsonb,                           -- ["theme", ...]
  issues jsonb,                          -- ["theme", ...]
  sentiment text,                        -- positive | mixed | negative
  reviews_analyzed int,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_reviews_studio_date ON google_reviews(studio_id, review_date DESC);
