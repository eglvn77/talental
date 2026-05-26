-- ============================================================
-- Root cause of every careers-page 404 we hit during launch.
--
-- The careers_* RPCs are SECURITY DEFINER and EXECUTE'd to anon, but
-- the anon role lacked USAGE on the `hiring` schema. Without USAGE,
-- anon can't even resolve `hiring.careers_*(...)` as a name — the
-- query fails with "permission denied for schema hiring" before the
-- function body runs. The Supabase JS client surfaces this as a
-- generic error, our loaders swallow it and return null, and the
-- page falls through to notFound() → 404.
--
-- USAGE alone is safe: it doesn't grant SELECT/INSERT/UPDATE on any
-- table. The only ways anon can touch the schema remain:
--   - the careers_* SECURITY DEFINER functions explicitly EXECUTE'd
--     for it (gated by status + publication_status filters)
--   - nothing else (no table-level grants for anon)
-- ============================================================

GRANT USAGE ON SCHEMA hiring TO anon;
