-- Month-end lock: freeze the just-finished month so the daily writer can never
-- overwrite it again (every writer query includes `AND locked = false`).
-- Locked rows accumulate = the monthly trend series.
--
-- Run options:
--   A) Manually in the Supabase SQL editor on the last day of the month, OR
--   B) Schedule with pg_cron (below) to run at 00:05 on the 1st of each month,
--      locking the PREVIOUS month.

-- One-time manual lock (set :year/:month to the month you're closing):
-- UPDATE public.studio_trends SET locked = true, locked_at = now()
-- WHERE studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
--   AND year = :year AND month = :month AND locked = false;

-- pg_cron: lock the previous month at 00:05 on the 1st (America/Chicago ≈ 06:05 UTC).
-- Requires the pg_cron extension (enable in Supabase: Database → Extensions).
create extension if not exists pg_cron;

select cron.schedule(
  'lock-prev-month-studio-trends',
  '5 6 1 * *',
  $$
    update public.studio_trends
    set locked = true, locked_at = now()
    where studio_id = '3abc6af6-37b8-4c13-b761-a92b5204ca25'
      and locked = false
      and (year * 12 + month) < (
        extract(year from (now() at time zone 'America/Chicago'))::int * 12
        + extract(month from (now() at time zone 'America/Chicago'))::int
      );
  $$
);
