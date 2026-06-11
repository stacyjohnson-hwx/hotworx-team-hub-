-- 031_competitor_ratings_and_territory_b2b_link.sql

-- Competitors: rating, review count, and the date that rating/review snapshot was taken.
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS review_count INTEGER,
  ADD COLUMN IF NOT EXISTS reviews_updated_at DATE;

-- Territories (Canvassing): link an apartment zone to its B2B contact record, since
-- apartments live in both the Canvassing tracker and the B2B contacts list.
ALTER TABLE territories
  ADD COLUMN IF NOT EXISTS b2b_contact_id UUID REFERENCES b2b_contacts(id) ON DELETE SET NULL;
