-- Mirror trigger between jobs.{role_type, assessment_link} and
-- custom_field_values for the matching system defs.
--
-- The UI writes via upsertCustomFieldValueAction (custom field
-- values) and that path already mirrors back to the column. But
-- the kickoff/calibrar AI pipeline still patches the columns
-- directly when it persists side-effects; without this trigger
-- the custom_field_values rows would go stale and the admin
-- would see the previous values in the UI until manually
-- re-saved.

CREATE OR REPLACE FUNCTION hiring.sync_role_config_to_custom_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_def_id uuid;
  assess_def_id uuid;
BEGIN
  IF NEW.role_type IS DISTINCT FROM OLD.role_type THEN
    SELECT id INTO role_def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = NEW.workspace_id
      AND entity_type = 'job'
      AND key = 'role_type'
    LIMIT 1;
    IF role_def_id IS NOT NULL THEN
      IF NEW.role_type IS NULL THEN
        DELETE FROM hiring.custom_field_values
        WHERE definition_id = role_def_id AND entity_id = NEW.id;
      ELSE
        INSERT INTO hiring.custom_field_values
          (workspace_id, definition_id, entity_type, entity_id, value)
        VALUES
          (NEW.workspace_id, role_def_id, 'job', NEW.id,
           to_jsonb(NEW.role_type::text))
        ON CONFLICT (definition_id, entity_id) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now();
      END IF;
    END IF;
  END IF;

  IF NEW.assessment_link IS DISTINCT FROM OLD.assessment_link THEN
    SELECT id INTO assess_def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = NEW.workspace_id
      AND entity_type = 'job'
      AND key = 'assessment_link'
    LIMIT 1;
    IF assess_def_id IS NOT NULL THEN
      IF NEW.assessment_link IS NULL OR NEW.assessment_link = '' THEN
        DELETE FROM hiring.custom_field_values
        WHERE definition_id = assess_def_id AND entity_id = NEW.id;
      ELSE
        INSERT INTO hiring.custom_field_values
          (workspace_id, definition_id, entity_type, entity_id, value)
        VALUES
          (NEW.workspace_id, assess_def_id, 'job', NEW.id,
           to_jsonb(NEW.assessment_link))
        ON CONFLICT (definition_id, entity_id) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_role_config ON hiring.jobs;
CREATE TRIGGER trg_sync_role_config
  AFTER UPDATE OF role_type, assessment_link ON hiring.jobs
  FOR EACH ROW
  EXECUTE FUNCTION hiring.sync_role_config_to_custom_fields();
