-- Tag marketing content photos to actual members (many-to-many) so photos can be
-- searched by member and pulled for milestone shout-outs. member_name (free text)
-- stays on marketing_content_assets for backward compat / non-roster notes.
create table if not exists marketing_content_member_tags (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  content_id  uuid not null references marketing_content_assets(id) on delete cascade,
  member_id   uuid not null references onboarding_members(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (content_id, member_id)
);
create index if not exists idx_mct_content on marketing_content_member_tags(content_id);
create index if not exists idx_mct_member on marketing_content_member_tags(studio_id, member_id);
alter table marketing_content_member_tags enable row level security;
