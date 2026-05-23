-- EOD form v2: expanded sales, lead gen, engagement, training fields
-- Run this in the Supabase SQL Editor

ALTER TABLE eod_submissions
  -- Sales (replaces new_memberships + eft_amount)
  ADD COLUMN IF NOT EXISTS sweat_basic       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sweat_elite       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellations_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellations_notes TEXT,

  -- Lead generation (replaces simple leads_count)
  ADD COLUMN IF NOT EXISTS phone_calls             INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_sent                INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS red_appt_scheduled      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes_added_missed      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followed_up_missed      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS survey_sent_red_appts   BOOLEAN NOT NULL DEFAULT FALSE,

  -- Membership engagement (11 items, goal = 3)
  ADD COLUMN IF NOT EXISTS eng_testimonial         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_google_review       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_photos_members      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_photos_rewards      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_ambassador          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_app_link            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_biz_month           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_ig_tiktok           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_new_member          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_follow_up           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eng_thank_you_cards     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Sales training (role_played replaces called_leads)
  ADD COLUMN IF NOT EXISTS role_played_script      BOOLEAN NOT NULL DEFAULT FALSE;
