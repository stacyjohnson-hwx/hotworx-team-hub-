-- Cards & Birthdays recognition checklist (separate from the urgent Daily List).
-- thank_you_card rows auto-appear per new member; birthday rows come from a
-- monthly upload. dedup_key keeps re-runs/re-imports from duplicating.
create table if not exists onboarding_recognition_tasks (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  type          text not null,                 -- thank_you_card / birthday
  member_id     uuid references onboarding_members(id) on delete set null,
  member_name   text,
  email         text,
  phone         text,
  ref_date      date,
  month_key     text,
  status        text default 'pending',        -- pending / completed / skipped
  completed_by  text,
  completed_at  timestamptz,
  source        text default 'auto',           -- auto / import
  dedup_key     text not null,                 -- card|<member_id> or bday|<month>|<email-or-name>
  created_at    timestamptz default now(),
  unique (studio_id, dedup_key)
);
create index if not exists idx_onb_recog on onboarding_recognition_tasks(studio_id, type, status);
alter table onboarding_recognition_tasks enable row level security;
