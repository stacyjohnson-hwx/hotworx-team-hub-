-- "Coming from" studio for a member — mainly for reciprocal members visiting
-- from another HOTWORX location. Free text (e.g. "HOTWORX Madison").
alter table onboarding_members add column if not exists origin_studio text;
