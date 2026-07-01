-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding Journey Module — Phase 2: journeys, team queue, templates, rewards
--
-- New-member detection creates a journey and seeds day-based team touchpoints;
-- event triggers (milestones/passport/save fork/re-engagement) and the unified
-- Daily List read from these tables. Service-role only (RLS on, no policies).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists onboarding_journeys (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid not null references studios(id) on delete cascade,
  member_id             uuid not null references onboarding_members(id) on delete cascade,
  start_date            date,
  current_track         text default 'onboarding',   -- onboarding / save / graduated
  challenge_cycle_start date,
  orientation_completed boolean default false,
  first_session_flag    text,                         -- great / rough / no_show / null
  next3_booked          boolean default false,
  graduated_at          date,
  status                text default 'active',        -- active / paused / completed
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (studio_id, member_id)
);
create index if not exists idx_onb_journeys_studio on onboarding_journeys(studio_id);

create table if not exists onboarding_journey_tasks (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios(id) on delete cascade,
  journey_id    uuid not null references onboarding_journeys(id) on delete cascade,
  type          text not null,                        -- call / text
  template_key  text,
  trigger_kind  text,                                 -- day_based / event_based
  trigger_ref   text,                                 -- day_2 / milestone_25 / save_14d / reengage_14 …
  due_date      date,
  priority      int default 6,
  status        text default 'pending',               -- pending / completed / skipped
  completed_by  text,
  completed_at  timestamptz,
  context       jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  unique (journey_id, trigger_ref)
);
create index if not exists idx_onb_tasks_studio on onboarding_journey_tasks(studio_id, status);

create table if not exists onboarding_touchpoint_templates (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  template_key text not null,
  label        text,
  channel      text default 'text',                   -- text / call
  body         text,
  updated_by   text,
  updated_at   timestamptz default now(),
  unique (studio_id, template_key)
);

create table if not exists onboarding_rewards_awarded (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  member_id       uuid not null references onboarding_members(id) on delete cascade,
  reward_key      text not null,                      -- sticker / shoutout_10 / keychain_25 / …
  awarded_at      timestamptz default now(),
  fulfilled       boolean default false,
  manual_override boolean default false,
  unique (studio_id, member_id, reward_key)
);

create table if not exists onboarding_transformation_records (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references studios(id) on delete cascade,
  member_id          uuid not null references onboarding_members(id) on delete cascade,
  goal_text          text,
  before_photo_url   text,
  progress_photo_url text,
  after_photo_url    text,
  consent            boolean default false,
  captured_by        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (studio_id, member_id)
);

create table if not exists onboarding_mailchimp_queue (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  member_id   uuid references onboarding_members(id) on delete set null,
  customer_id text,
  email       text,
  action      text default 'subscribe',
  tags        jsonb default '[]'::jsonb,
  status      text default 'pending',                 -- pending / sent / failed
  attempts    int default 0,
  last_error  text,
  created_at  timestamptz default now(),
  sent_at     timestamptz
);
create index if not exists idx_onb_mc_queue on onboarding_mailchimp_queue(studio_id, status);

alter table onboarding_journeys                enable row level security;
alter table onboarding_journey_tasks           enable row level security;
alter table onboarding_touchpoint_templates    enable row level security;
alter table onboarding_rewards_awarded         enable row level security;
alter table onboarding_transformation_records  enable row level security;
alter table onboarding_mailchimp_queue         enable row level security;

-- Photo storage for transformation records (public read, authed write).
insert into storage.buckets (id, name, public, file_size_limit)
values ('onboarding-photos', 'onboarding-photos', true, 104857600)
on conflict (id) do nothing;
