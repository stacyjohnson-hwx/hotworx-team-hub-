-- 035_security_hardening.sql
-- Security advisor remediations (applied live via Supabase). Repo record.
--
-- 1) Two SECURITY DEFINER RPCs were callable directly by signed-in users (data
--    leak across studios). They're only used by the backend (service_role), so
--    remove client EXECUTE and keep service_role.
revoke execute on function public.get_contact_linked_events(uuid) from public, anon, authenticated;
grant  execute on function public.get_contact_linked_events(uuid) to service_role;
revoke execute on function public.get_user_display_names(uuid[]) from public, anon, authenticated;
grant  execute on function public.get_user_display_names(uuid[]) to service_role;

-- 2) Public storage buckets had broad SELECT policies allowing clients to LIST
--    (enumerate) every file. Individual public-URL reads don't need these; the
--    app never calls .list(). Drop them.
drop policy if exists "avatars_read"             on storage.objects;
drop policy if exists "b2b_logos_select"         on storage.objects;
drop policy if exists "marketing_content_select" on storage.objects;

-- 3) feedback had an always-true INSERT policy for authenticated. The app inserts
--    via the backend (service_role, bypasses RLS), so remove the direct-insert path.
drop policy if exists "Auth users can insert feedback" on public.feedback;

-- NOTE: still pending (dashboard-only): enable Auth leaked-password protection
-- (HaveIBeenPwned) under Authentication settings.
