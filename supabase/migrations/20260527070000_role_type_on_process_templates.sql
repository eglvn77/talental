-- Move role_type from per-job (column + custom field) to per
-- process template. The recruiter picks "Proceso" when creating a
-- vacante; the template's role_type drives the kickoff prompt.
-- No more "Tipo de rol" inline field, no more banner, no two
-- conflicting sources of truth.
--
-- Migration plan:
--   1. Add `role_type` column on process_templates with a default.
--      The column already exists as the `hiring.role_type` enum.
--   2. Drop the bidirectional sync trigger between jobs.role_type
--      and the workspace's role_type custom field — that bridge
--      is what made the dialog show two pickers for the same thing.
--   3. Drop the role_type custom field definition + its values.
--   4. Backfill jobs.role_type from the assigned template where it
--      was null, so existing readers keep working.
--
-- jobs.role_type stays as a denormalized cache so the dozens of
-- readers across the app don't break. New writes happen only at job
-- create time (copied from the template). A follow-up migration can
-- drop the column once readers are migrated to read via template.

-- 1. Add role_type on process_templates.
ALTER TABLE hiring.process_templates
  ADD COLUMN IF NOT EXISTS role_type hiring.role_type
    NOT NULL DEFAULT 'full_headhunting';

-- 2. Drop the bridging triggers + helper functions. They wrote into
--    custom_field_values whenever jobs.role_type changed; we're
--    deleting both sides, so the bridge has no job.
DROP TRIGGER IF EXISTS trg_sync_role_config ON hiring.jobs;
DROP FUNCTION IF EXISTS hiring.sync_role_config_to_custom_fields();
DROP FUNCTION IF EXISTS hiring.role_type_label(text);

-- 3. Delete the role_type custom field — definition and any stored
--    values. CASCADE-on-delete on definition_id handles the values
--    rows, but be explicit so the intent is obvious in the diff.
DELETE FROM hiring.custom_field_values v
  USING hiring.custom_field_definitions d
  WHERE v.definition_id = d.id
    AND d.entity_type = 'job'
    AND d.key = 'role_type';

DELETE FROM hiring.custom_field_definitions
  WHERE entity_type = 'job' AND key = 'role_type';

-- 4. Backfill jobs.role_type from the assigned template for any row
--    that still has it null. Defaults to the template's value
--    (which itself defaulted to 'full_headhunting' above).
UPDATE hiring.jobs j
   SET role_type = pt.role_type
  FROM hiring.process_templates pt
 WHERE j.process_template_id = pt.id
   AND j.role_type IS NULL;
