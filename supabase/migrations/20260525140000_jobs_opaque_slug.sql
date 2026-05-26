-- ============================================================
-- Switch jobs.slug to a short opaque ID derived from the UUID.
--
-- Rationale: title-derived slugs go stale the moment the recruiter
-- recalibrates the rol (renombrar de "Head of Marketing" a "VP of
-- Marketing & Growth" deja la URL diciendo head-of-marketing forever
-- — confusing for candidates clicking an old link). An 8-hex-char
-- prefix of the row's UUID gives us:
--   - permanence (UUID never changes; trigger blocks slug updates)
--   - independence from title
--   - readability (much shorter than the full UUID)
--   - uniqueness (2^32 namespace per workspace + UNIQUE index)
--
-- We also fix a latent bug: jobs.slug is NOT NULL with no default
-- and the app code didn't set it. The careers backfill migration
-- filled existing rows, but any new INSERT would have failed. The
-- BEFORE INSERT trigger below populates slug from NEW.id when it
-- isn't provided.
-- ============================================================

DROP TRIGGER IF EXISTS jobs_slug_immutable ON hiring.jobs;

UPDATE hiring.jobs
SET slug = substring(id::text from 1 for 8);

CREATE OR REPLACE FUNCTION hiring.tg_jobs_default_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := substring(NEW.id::text from 1 for 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_default_slug ON hiring.jobs;
CREATE TRIGGER jobs_default_slug
  BEFORE INSERT ON hiring.jobs
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_jobs_default_slug();

CREATE TRIGGER jobs_slug_immutable
  BEFORE UPDATE OF slug ON hiring.jobs
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_jobs_slug_immutable();
