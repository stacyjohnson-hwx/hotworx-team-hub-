-- Unreconciled bookings, grouped by email (one row per person) across ALL
-- months. The /unreconciled endpoint previously returned the newest 500 raw
-- booking rows, which truncated older months entirely (only recent months
-- showed up). Grouping server-side returns every unreconciled person regardless
-- of how many bookings they have or which month they fall in.
CREATE OR REPLACE VIEW onboarding_unreconciled_emails
WITH (security_invoker = true) AS
SELECT studio_id,
       COALESCE(NULLIF(lower(member_email), ''), '(no email)') AS email,
       count(*)::int        AS booking_count,
       max(booking_date)    AS last_booking_date,
       min(booking_date)    AS first_booking_date
FROM onboarding_bookings
WHERE member_id IS NULL
GROUP BY studio_id, COALESCE(NULLIF(lower(member_email), ''), '(no email)');

-- Only the service-role backend reads this; keep it off the public Data API.
REVOKE ALL ON onboarding_unreconciled_emails FROM anon, authenticated;
