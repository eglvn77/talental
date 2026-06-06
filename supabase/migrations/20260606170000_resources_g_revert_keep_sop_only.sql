-- =====================================================
-- Revert the Package → Resources rebuild at the DB layer.
-- Keep SOP customization (kind='checklist' definitions + their values).
-- Drop:
--   * mirror-back trigger + function (no single-write path uses it)
--   * default_section_prompt / default_section_schema helper functions
--   * the 6 paquete system definitions + their resource_values (cascade)
-- Keep:
--   * resource_definitions + resource_values tables
--   * the SOP system definition per workspace
--   * sop_default_template_json() + the protect-system trigger
--   * the workspace seed trigger (now only inserts SOP)
-- =====================================================

DROP TRIGGER IF EXISTS resource_values_mirror_back ON hiring.resource_values;
DROP FUNCTION IF EXISTS hiring.tg_resource_values_mirror_back();

DROP FUNCTION IF EXISTS hiring.default_section_prompt(text);
DROP FUNCTION IF EXISTS hiring.default_section_schema(text);

-- New workspaces only get the SOP definition seeded.
CREATE OR REPLACE FUNCTION hiring.tg_workspaces_seed_resource_definitions()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  INSERT INTO hiring.resource_definitions
    (workspace_id, key, label, kind, position, is_system, is_enabled,
     schema_json, generator_prompt, template_json)
  VALUES
    (NEW.id, 'sop', 'SOP', 'checklist', 0, true, true,
     '{}'::jsonb, '', hiring.sop_default_template_json())
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$fn$;

-- Temporarily disable the protect-system trigger so we can delete
-- the now-obsolete paquete system rows. CASCADE drops their values
-- via the existing FK on resource_values.
ALTER TABLE hiring.resource_definitions DISABLE TRIGGER resource_definitions_protect_system;

DELETE FROM hiring.resource_definitions
WHERE is_system = true
  AND key IN (
    'requirements','sourcing','hiring_process','application_questions',
    'ai_interview_questions','talental_interview_script','outreach_sequence'
  );

ALTER TABLE hiring.resource_definitions ENABLE TRIGGER resource_definitions_protect_system;
