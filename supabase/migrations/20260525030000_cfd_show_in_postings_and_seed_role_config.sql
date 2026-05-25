-- Custom field definitions: two new columns.
--
--   show_in_postings — when true, the field renders on the public
--   careers/posting page for the entity. Lives on
--   custom_field_definitions so any entity type can opt in later.
--
--   is_system — locks the definition so admins can't delete or
--   rename critical keys. Used for the two AI-driven role-config
--   fields (role_type, assessment_link) that the kickoff pipeline
--   reads by key.
--
-- Then seeds role_type + assessment_link as system-managed custom
-- field definitions per existing workspace and backfills values
-- from the legacy `jobs.role_type` / `jobs.assessment_link`
-- columns. Those columns stay around as a mirror cache so the AI
-- flows that read `job.role_type` keep working; updateJobAction +
-- upsertCustomFieldValueAction sync writes between the two
-- surfaces.

ALTER TABLE hiring.custom_field_definitions
  ADD COLUMN IF NOT EXISTS show_in_postings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  ws RECORD;
  role_def_id uuid;
  assess_def_id uuid;
  next_pos integer;
BEGIN
  FOR ws IN SELECT id FROM hiring.workspaces LOOP
    SELECT id INTO role_def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = ws.id
      AND entity_type = 'job'
      AND key = 'role_type'
    LIMIT 1;

    SELECT COALESCE(MAX(position), -1) + 1 INTO next_pos
    FROM hiring.custom_field_definitions
    WHERE workspace_id = ws.id AND entity_type = 'job';

    IF role_def_id IS NULL THEN
      INSERT INTO hiring.custom_field_definitions
        (workspace_id, entity_type, key, label, kind, position,
         options, is_required, is_filterable, is_visible_in_columns,
         is_system)
      VALUES
        (ws.id, 'job', 'role_type', 'Tipo de rol', 'select', next_pos,
         '["full_headhunting","hybrid_ai_hunting","inbound_ai_driven"]'::jsonb,
         true, true, true, true)
      RETURNING id INTO role_def_id;
    ELSE
      UPDATE hiring.custom_field_definitions
      SET is_system = true,
          is_filterable = true,
          is_visible_in_columns = true,
          is_required = true,
          options = '["full_headhunting","hybrid_ai_hunting","inbound_ai_driven"]'::jsonb
      WHERE id = role_def_id;
    END IF;

    INSERT INTO hiring.custom_field_values
      (workspace_id, entity_type, entity_id, definition_id, value)
    SELECT
      j.workspace_id, 'job', j.id, role_def_id, to_jsonb(j.role_type::text)
    FROM hiring.jobs j
    WHERE j.workspace_id = ws.id
      AND j.role_type IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM hiring.custom_field_values v
        WHERE v.definition_id = role_def_id AND v.entity_id = j.id
      );

    SELECT id INTO assess_def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = ws.id
      AND entity_type = 'job'
      AND key = 'assessment_link'
    LIMIT 1;

    SELECT COALESCE(MAX(position), -1) + 1 INTO next_pos
    FROM hiring.custom_field_definitions
    WHERE workspace_id = ws.id AND entity_type = 'job';

    IF assess_def_id IS NULL THEN
      INSERT INTO hiring.custom_field_definitions
        (workspace_id, entity_type, key, label, kind, position,
         is_required, is_filterable, is_visible_in_columns, is_system)
      VALUES
        (ws.id, 'job', 'assessment_link', 'Link del assessment', 'url',
         next_pos, false, true, true, true)
      RETURNING id INTO assess_def_id;
    ELSE
      UPDATE hiring.custom_field_definitions
      SET is_system = true,
          is_filterable = true,
          is_visible_in_columns = true,
          kind = 'url'
      WHERE id = assess_def_id;
    END IF;

    INSERT INTO hiring.custom_field_values
      (workspace_id, entity_type, entity_id, definition_id, value)
    SELECT
      j.workspace_id, 'job', j.id, assess_def_id, to_jsonb(j.assessment_link)
    FROM hiring.jobs j
    WHERE j.workspace_id = ws.id
      AND j.assessment_link IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM hiring.custom_field_values v
        WHERE v.definition_id = assess_def_id AND v.entity_id = j.id
      );
  END LOOP;
END $$;
