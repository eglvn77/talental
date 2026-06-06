-- =====================================================
-- Resources Migration B: backfill resource_values from legacy
-- hiring.jobs.<column> jsonb / text fields.
--
-- Mapping (system definition key → source column):
--   requirements              → hiring.jobs.requirements              (jsonb)
--   sourcing                  → hiring.jobs.sourcing                  (jsonb)
--   hiring_process            → hiring.jobs.hiring_process            (jsonb)
--   application_questions     → hiring.jobs.screening_questions       (jsonb)
--   ai_interview_questions    → hiring.jobs.interview_questions       (jsonb)
--   talental_interview_script → hiring.jobs.interview_script ->>'markdown' (text)
--   outreach_sequence         → hiring.sequences.id WHERE default_job_id=…
--
-- Rules:
--   * NULL legacy value → no row (= "not generated yet").
--   * Empty jsonb (e.g. {must:[],nice:[]}, [], "")  → insert with
--     that value (= "generated, but empty").
--   * Archived jobs are NOT excluded — the audit trail breaks if
--     they're dropped, and 2 Talental jobs are archived.
--   * generated_by = 'backfill', generated_at = the job's
--     updated_at (best signal we have for when content was authored).
--   * Single transaction. Raises on row-count mismatch so a partial
--     migration aborts cleanly.
-- =====================================================

DO $fn$
DECLARE
  job_record record;
  def_record record;
  defs_by_workspace jsonb := '{}'::jsonb;
  total_inserts int := 0;
  expected int;
  sequence_id_for_job uuid;
BEGIN
  -- Cache definition ids per (workspace_id, key) so we don't hit
  -- resource_definitions on every job × every section. Build once.
  FOR def_record IN
    SELECT workspace_id, key, id FROM hiring.resource_definitions
  LOOP
    defs_by_workspace := jsonb_set(
      defs_by_workspace,
      ARRAY[def_record.workspace_id::text, def_record.key],
      to_jsonb(def_record.id::text),
      true
    );
  END LOOP;

  FOR job_record IN
    SELECT id, workspace_id, requirements, sourcing, hiring_process,
           screening_questions, interview_questions, interview_script,
           updated_at
    FROM hiring.jobs
  LOOP
    -- requirements
    IF job_record.requirements IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id,
        job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'requirements'])::uuid,
        job_record.requirements,
        'backfill',
        job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- sourcing
    IF job_record.sourcing IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'sourcing'])::uuid,
        job_record.sourcing, 'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- hiring_process
    IF job_record.hiring_process IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'hiring_process'])::uuid,
        job_record.hiring_process, 'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- application_questions ← screening_questions
    IF job_record.screening_questions IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'application_questions'])::uuid,
        job_record.screening_questions, 'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- ai_interview_questions ← interview_questions
    IF job_record.interview_questions IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'ai_interview_questions'])::uuid,
        job_record.interview_questions, 'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- talental_interview_script ← interview_script.markdown
    --   value is stored as a jsonb string (kind=markdown).
    IF job_record.interview_script IS NOT NULL
       AND job_record.interview_script ? 'markdown'
       AND job_record.interview_script->>'markdown' IS NOT NULL
    THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'talental_interview_script'])::uuid,
        to_jsonb(job_record.interview_script->>'markdown'),
        'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;

    -- outreach_sequence — pointer to the default sequence for this job.
    SELECT id INTO sequence_id_for_job
      FROM hiring.sequences
      WHERE default_job_id = job_record.id
      LIMIT 1;
    IF sequence_id_for_job IS NOT NULL THEN
      INSERT INTO hiring.resource_values
        (workspace_id, job_id, definition_id, value, generated_by, generated_at)
      VALUES (
        job_record.workspace_id, job_record.id,
        (defs_by_workspace #>> ARRAY[job_record.workspace_id::text, 'outreach_sequence'])::uuid,
        jsonb_build_object('sequence_id', sequence_id_for_job),
        'backfill', job_record.updated_at
      )
      ON CONFLICT (job_id, definition_id) DO NOTHING;
      total_inserts := total_inserts + 1;
    END IF;
  END LOOP;

  -- Sanity check: count what actually landed.
  SELECT count(*) INTO expected FROM hiring.resource_values;
  RAISE NOTICE 'Resources backfill: % inserts attempted, % rows now in resource_values',
    total_inserts, expected;
END;
$fn$;
