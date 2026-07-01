-- Member mailing address (populated from the birthday export when the person is
-- already a member) + extra context fields on birthday tasks (lead sub-status +
-- last booked session) so the team sees who they're texting.
alter table onboarding_members add column if not exists address text;
alter table onboarding_members add column if not exists city text;
alter table onboarding_members add column if not exists state text;
alter table onboarding_members add column if not exists postal_code text;

alter table onboarding_recognition_tasks add column if not exists customer_id text;
alter table onboarding_recognition_tasks add column if not exists lead_status text;
alter table onboarding_recognition_tasks add column if not exists sub_status text;
alter table onboarding_recognition_tasks add column if not exists last_session date;
