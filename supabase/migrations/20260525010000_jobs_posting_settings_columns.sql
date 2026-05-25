-- Columns powering the Publicación tab. These configure how the
-- vacante surfaces on the public careers page and what the apply
-- form asks for. Sensible defaults so existing rows behave reasonably
-- without a backfill step.

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS posting_language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS show_salary_in_posting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_cv boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_cover_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ask_for_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ask_for_salary_expectations boolean NOT NULL DEFAULT false;

ALTER TABLE hiring.jobs
  DROP CONSTRAINT IF EXISTS jobs_posting_language_check;
ALTER TABLE hiring.jobs
  ADD CONSTRAINT jobs_posting_language_check
    CHECK (posting_language IN ('es','en'));
