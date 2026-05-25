-- =====================================================
-- Role configuration columns on hiring.jobs.
--
-- The "Setup" block (Tipo de rol + idiomas + flags) was collected
-- inside the Kickoff/Calibrar dialog every time it ran. It belongs
-- on the vacante itself — admin configures it once in Ajustes,
-- Kickoff/Calibrar reads it from the row. This migration adds the
-- missing columns; existing rows get sensible defaults that match
-- the dialog's previous defaults so behaviour doesn't change for
-- vacantes that already have content.
--
-- Note: `role_type` and `assessment_link` already exist; they're
-- the two columns the old code persisted. Everything else (idiomas,
-- flags) was held in client state only.
-- =====================================================

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS jd_language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS outreach_language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS ai_process_language text,
  ADD COLUMN IF NOT EXISTS include_salary_in_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_company_in_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_emojis_in_jd boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS create_assessment boolean NOT NULL DEFAULT false;

-- Constrain idiomas to the two values the UI exposes. NOT NULL is
-- already enforced; the check keeps strays out.
ALTER TABLE hiring.jobs
  ADD CONSTRAINT jobs_jd_language_check
    CHECK (jd_language IN ('es', 'en'));

ALTER TABLE hiring.jobs
  ADD CONSTRAINT jobs_outreach_language_check
    CHECK (outreach_language IN ('es', 'en'));

ALTER TABLE hiring.jobs
  ADD CONSTRAINT jobs_ai_process_language_check
    CHECK (ai_process_language IS NULL OR ai_process_language IN ('es', 'en'));
