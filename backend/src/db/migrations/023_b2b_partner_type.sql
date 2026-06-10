-- 023_b2b_partner_type.sql
-- B2B Phase 1: tag each business as a referral/collab partner or a corporate
-- membership prospect, so the two motions can be filtered and run differently.

ALTER TABLE b2b_contacts
  ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'referral_collab';
  -- 'referral_collab' | 'corporate'
