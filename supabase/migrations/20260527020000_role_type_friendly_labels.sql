-- Friendly labels for the role_type custom field. Today the options
-- + stored values are the enum slugs (full_headhunting / etc.),
-- which surface raw in the jobs-table filter. Migrate them to
-- human-readable strings and teach the sync trigger to translate
-- enum → label on the way in.

CREATE OR REPLACE FUNCTION hiring.role_type_label(slug text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE slug
    WHEN 'full_headhunting'   THEN 'Headhunting completo'
    WHEN 'hybrid_ai_hunting'  THEN 'Hybrid AI hunting'
    WHEN 'inbound_ai_driven'  THEN 'Inbound AI driven'
    ELSE slug
  END
$$;

UPDATE hiring.custom_field_definitions
SET options = jsonb_build_array(
  'Headhunting completo',
  'Hybrid AI hunting',
  'Inbound AI driven'
)
WHERE entity_type = 'job' AND key = 'role_type';

UPDATE hiring.custom_field_values v
SET value = to_jsonb(
  hiring.role_type_label(v.value #>> '{}')
)
FROM hiring.custom_field_definitions d
WHERE v.definition_id = d.id
  AND d.entity_type = 'job'
  AND d.key = 'role_type'
  AND v.value IS NOT NULL;

CREATE OR REPLACE FUNCTION hiring.sync_role_config_to_custom_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  def_id uuid;
BEGIN
  IF NEW.role_type IS DISTINCT FROM OLD.role_type THEN
    SELECT id INTO def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = NEW.workspace_id
      AND entity_type = 'job'
      AND key = 'role_type'
    LIMIT 1;
    IF def_id IS NOT NULL THEN
      IF NEW.role_type IS NULL THEN
        DELETE FROM hiring.custom_field_values
        WHERE definition_id = def_id AND entity_id = NEW.id;
      ELSE
        INSERT INTO hiring.custom_field_values (definition_id, entity_id, value)
        VALUES (def_id, NEW.id,
                to_jsonb(hiring.role_type_label(NEW.role_type::text)))
        ON CONFLICT (definition_id, entity_id) DO UPDATE
        SET value = EXCLUDED.value;
      END IF;
    END IF;
  END IF;

  IF NEW.assessment_link IS DISTINCT FROM OLD.assessment_link THEN
    SELECT id INTO def_id
    FROM hiring.custom_field_definitions
    WHERE workspace_id = NEW.workspace_id
      AND entity_type = 'job'
      AND key = 'assessment_link'
    LIMIT 1;
    IF def_id IS NOT NULL THEN
      IF NEW.assessment_link IS NULL OR NEW.assessment_link = '' THEN
        DELETE FROM hiring.custom_field_values
        WHERE definition_id = def_id AND entity_id = NEW.id;
      ELSE
        INSERT INTO hiring.custom_field_values (definition_id, entity_id, value)
        VALUES (def_id, NEW.id, to_jsonb(NEW.assessment_link))
        ON CONFLICT (definition_id, entity_id) DO UPDATE
        SET value = EXCLUDED.value;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
