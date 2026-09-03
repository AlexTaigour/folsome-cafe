-- Folsom Cafe POS — PRODUCTION security hardening for the database.
--
-- Run this ONCE, in Supabase Dashboard → SQL Editor → New query → Run, but only
-- AFTER you have switched the server to the service_role key:
--   1. Set SUPABASE_SERVICE_ROLE_KEY in your host environment (see DEPLOYMENT.md).
--   2. Redeploy / restart the server and confirm it boots and works.
--   3. Then run this file.
--
-- Why: supabase-schema.sql grants the `anon` role full access to every table so
-- the server can use the anon key. That makes the anon key a de-facto database
-- password. The service_role key BYPASSES row-level security, so once the server
-- uses it, the anon policy is no longer needed — dropping it means a leaked anon
-- key can read/write NOTHING. RLS stays ENABLED with no anon policy → anon is
-- denied by default; the server (service_role) keeps full access.
--
-- Safe to re-run. Reversible: re-running supabase-schema.sql restores the anon
-- policy if you ever need to fall back to the anon key.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','menu_items','orders','order_items','order_status_history',
    'payments','credit_entries','service_calls','app_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS server_full_access ON %I', t);
  END LOOP;
END $$;

-- Verify: this should return zero rows (no anon policies remain).
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE schemaname = 'public' AND 'anon' = ANY (roles);
