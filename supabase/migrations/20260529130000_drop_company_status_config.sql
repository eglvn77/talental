-- ============================================================
-- Drop the now-orphaned workspaces.company_status_config jsonb.
--
-- Company statuses moved to the hiring.company_statuses table in
-- 20260529120000_company_statuses.sql, and that migration already
-- copied every workspace's label/color overrides into the table. No
-- code path reads or writes this column anymore, so it's dead weight.
-- ============================================================

ALTER TABLE hiring.workspaces DROP COLUMN IF EXISTS company_status_config;
