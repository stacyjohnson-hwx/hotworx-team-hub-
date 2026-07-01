-- Re-Engagement Queue cooldown log (§4.6). Re-engagement items are computed live
-- from the booking accumulator; this table only records when a lapsed member was
-- last contacted, so the same member isn't re-surfaced within the cooldown window.
create table if not exists onboarding_reengage_log (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  member_id     uuid not null references onboarding_members(id) on delete cascade,
  contacted_at  timestamptz default now(),
  contacted_by  text
);
create index if not exists idx_onb_reengage on onboarding_reengage_log(studio_id, member_id, contacted_at desc);
alter table onboarding_reengage_log enable row level security;
