-- =====================================================
-- Resources Migration C: mirror-back trigger.
--
-- During the ~30-day soak window the app writes ONLY to
-- hiring.resource_values. This trigger copies the new value back to
-- the legacy hiring.jobs.<column> so any out-of-band reader (older
-- SQL scripts, dashboards, the kickoff persist code before the
-- Phase 4 flip) keeps seeing the same content.
--
-- Special cases:
--   * `outreach_sequence` (kind=sequence) — value stores only a
--     {sequence_id} pointer; the source of truth lives in
--     hiring.sequences / hiring.sequence_steps. We DO NOT mirror
--     this one back; the writer that wants to update outreach has
--     to go through the child tables directly.
--   * `talental_interview_script` (kind=markdown) — value is a
--     jsonb string. The legacy column expects {markdown: <string>},
--     so we wrap before writing.
--   * Other system keys map 1:1 to a jsonb column.
--   * Custom (non-system) resources have NO legacy column to mirror
--     to; the trigger silently skips them.
--
-- pg_trigger_depth() guard prevents recursion if some future trigger
-- on hiring.jobs ever ends up calling back into resource_values.
-- =====================================================

CREATE OR REPLACE FUNCTION hiring.tg_resource_values_mirror_back()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  def_key text;
  is_sys boolean;
  def_kind text;
BEGIN
  -- Avoid recursion if jobs ever fires a trigger that ends up here.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT key, is_system, kind
    INTO def_key, is_sys, def_kind
    FROM hiring.resource_definitions
    WHERE id = NEW.definition_id;

  -- Only system resources have a legacy column to mirror to.
  IF NOT is_sys THEN
    RETURN NEW;
  END IF;

  -- Outreach sequence has no jsonb column; its source of truth is
  -- the child tables. Skip.
  IF def_kind = 'sequence' THEN
    RETURN NEW;
  END IF;

  IF def_key = 'requirements' THEN
    UPDATE hiring.jobs SET requirements = NEW.value WHERE id = NEW.job_id;
  ELSIF def_key = 'sourcing' THEN
    UPDATE hiring.jobs SET sourcing = NEW.value WHERE id = NEW.job_id;
  ELSIF def_key = 'hiring_process' THEN
    UPDATE hiring.jobs SET hiring_process = NEW.value WHERE id = NEW.job_id;
  ELSIF def_key = 'application_questions' THEN
    UPDATE hiring.jobs SET screening_questions = NEW.value WHERE id = NEW.job_id;
  ELSIF def_key = 'ai_interview_questions' THEN
    UPDATE hiring.jobs SET interview_questions = NEW.value WHERE id = NEW.job_id;
  ELSIF def_key = 'talental_interview_script' THEN
    -- value is a jsonb string; legacy column expects {markdown: ...}.
    UPDATE hiring.jobs
      SET interview_script = jsonb_build_object(
        'markdown',
        CASE WHEN jsonb_typeof(NEW.value) = 'string'
          THEN NEW.value #>> '{}'
          ELSE NEW.value::text END
      )
      WHERE id = NEW.job_id;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS resource_values_mirror_back ON hiring.resource_values;
CREATE TRIGGER resource_values_mirror_back
  AFTER INSERT OR UPDATE OF value ON hiring.resource_values
  FOR EACH ROW
  EXECUTE FUNCTION hiring.tg_resource_values_mirror_back();
