-- Expiration date for time-limited memberships (mainly Paid-In-Full and comp).
-- When it passes, the member shows an "expired" flag in the roster.
alter table onboarding_members add column if not exists expiration_date date;
