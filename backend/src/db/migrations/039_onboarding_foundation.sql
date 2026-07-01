-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding Journey Module ("First 90") — Phase 1: data foundation
--
-- Feeds on three daily SAIL CSV exports (booking / member roster / cancelled),
-- uploaded via the in-app Daily Import screen. Establishes the member roster,
-- the booking accumulator, the cancellation ledger (the new source of truth for
-- Studio Trends cancellations), and a separately-stored month override layer.
--
-- Access model: only the service-role backend touches these tables, so RLS is
-- enabled with no policies (locked to service role; anon/authenticated denied).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Members (person-level roster, keyed on SAIL Customer Id) ──────────────────
create table if not exists onboarding_members (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios(id) on delete cascade,
  customer_id       text not null,
  subscription_id   text,
  full_name         text,
  primary_member    text,
  email             text,
  phone             text,
  join_date         date,
  package_name      text,
  status            text,               -- Active / Frozen / Past Due
  order_source      text,               -- POS / Online
  employee          text,               -- enroller, for attribution
  member_onboarded  boolean default false,
  agreement_signed  boolean default false,
  brivo_active      boolean default false,
  is_new_member     boolean default false,  -- join_date >= launch date (scope gate)
  is_cancelled      boolean default false,
  cancelled_date    date,
  roster_absent_days int default 0,      -- backup signal; N consecutive missing imports
  seen_in_last_import boolean default true,
  mailchimp_status  text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (studio_id, customer_id)
);
create index if not exists idx_onb_members_studio on onboarding_members(studio_id);
create index if not exists idx_onb_members_email  on onboarding_members(studio_id, lower(email));
create index if not exists idx_onb_members_phone  on onboarding_members(studio_id, phone);

-- ── Bookings accumulator (one row per SAIL booking export row) ────────────────
create table if not exists onboarding_bookings (
  booking_id    bigint not null,
  studio_id     uuid not null references studios(id) on delete cascade,
  member_email  text,
  member_id     uuid references onboarding_members(id) on delete set null, -- resolved at import
  booking_date  date,
  time_slot     text,
  session_type  text,
  home_studio   text,
  imported_at   timestamptz default now(),
  primary key (studio_id, booking_id)
);
create index if not exists idx_onb_bookings_member on onboarding_bookings(member_id);
create index if not exists idx_onb_bookings_studio on onboarding_bookings(studio_id);

-- ── Cancellation ledger (authoritative cancellation record) ───────────────────
create table if not exists onboarding_cancellation_ledger (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios(id) on delete cascade,
  customer_id     text not null,
  member_name     text,
  cancelled_date  date not null,
  month_key       text not null,        -- YYYY-MM
  in_save_module  boolean default false,
  excluded        boolean default false,
  excluded_reason text,
  excluded_by     text,
  source          text default 'export', -- export / manual_add
  created_at      timestamptz default now(),
  unique (studio_id, customer_id, cancelled_date)
);
create index if not exists idx_onb_ledger_month on onboarding_cancellation_ledger(studio_id, month_key);

-- ── Month-level metric overrides (stored separately from computed values) ─────
create table if not exists onboarding_metric_overrides (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id) on delete cascade,
  metric         text not null,          -- cancellations / active_members
  month_key      text not null,          -- YYYY-MM
  override_value int not null,
  reason         text not null,
  set_by         text,
  set_at         timestamptz default now(),
  unique (studio_id, metric, month_key)
);

-- ── Import run log (lightweight audit of each Daily Import) ────────────────────
create table if not exists onboarding_import_runs (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references studios(id) on delete cascade,
  run_at         timestamptz default now(),
  run_by         text,
  bookings_count int default 0,
  members_count  int default 0,
  cancelled_count int default 0,
  unreconciled_count int default 0,
  summary        jsonb
);
create index if not exists idx_onb_runs_studio on onboarding_import_runs(studio_id, run_at desc);

-- ── Derived member activity (computed view — never a stored counter) ──────────
create or replace view onboarding_member_activity as
select
  m.id                                     as member_id,
  m.studio_id                              as studio_id,
  count(distinct b.booking_date)           as visit_days,
  count(b.booking_id)                      as total_sessions,
  count(distinct b.session_type) filter (
    where b.session_type is not null
      and b.session_type not in ('New Member Orientation', 'RED Appointment')
  )                                        as workouts_tried,
  max(b.booking_date)                      as last_booking_date
from onboarding_members m
left join onboarding_bookings b
  on b.member_id = m.id and b.studio_id = m.studio_id
group by m.id, m.studio_id;

-- ── Lock down to service role ─────────────────────────────────────────────────
alter table onboarding_members               enable row level security;
alter table onboarding_bookings              enable row level security;
alter table onboarding_cancellation_ledger   enable row level security;
alter table onboarding_metric_overrides      enable row level security;
alter table onboarding_import_runs           enable row level security;
