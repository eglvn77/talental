-- ============================================================
-- Retire role_type entirely.
--
-- The role is now decided by the kickoff PROMPT the recruiter picks
-- (each prompt has an authoritative role header), not a per-job/per-
-- template enum. All code readers/writers were removed first; this
-- drops the now-dead columns and the enum type.
-- ============================================================

ALTER TABLE hiring.jobs DROP COLUMN IF EXISTS role_type;
ALTER TABLE hiring.process_templates DROP COLUMN IF EXISTS role_type;

DROP TYPE IF EXISTS hiring.role_type;
