-- =====================================================
-- Move role config from columns to custom fields.
--
-- A previous migration (20260524193203_jobs_add_role_config) added
-- `jd_language`, `outreach_language`, `ai_process_language`,
-- `include_salary_in_post`, `include_company_in_post`,
-- `use_emojis_in_jd`, `create_assessment` as columns on
-- `hiring.jobs`. Reversing course: these are configuration knobs
-- that vary per agency / workspace, so they belong on the existing
-- custom-fields infrastructure where each workspace can extend +
-- customise them. `role_type` and `assessment_link` stay as
-- columns since they're core to the AI flow's prompting.
--
-- Also adds two flags to custom_field_definitions:
--   * is_filterable        — the field appears in <FiltersPopover>
--                            on the relevant list page
--   * is_visible_in_columns — the field is a toggleable table column
-- Both default to `false` so existing definitions keep their current
-- (invisible-in-table-chrome) behaviour.
-- =====================================================

-- 1) Reverse the column adds. CHECK constraints get dropped with the
--    columns automatically.
ALTER TABLE hiring.jobs
  DROP COLUMN IF EXISTS jd_language,
  DROP COLUMN IF EXISTS outreach_language,
  DROP COLUMN IF EXISTS ai_process_language,
  DROP COLUMN IF EXISTS include_salary_in_post,
  DROP COLUMN IF EXISTS include_company_in_post,
  DROP COLUMN IF EXISTS use_emojis_in_jd,
  DROP COLUMN IF EXISTS create_assessment;

-- 2) Flags on custom_field_definitions.
ALTER TABLE hiring.custom_field_definitions
  ADD COLUMN IF NOT EXISTS is_filterable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_visible_in_columns boolean NOT NULL DEFAULT false;

-- 3) Seed the seven role-config fields per workspace, idempotently.
--    Each is created at the tail of the existing definitions for the
--    `job` entity; default values are NOT set on existing job rows —
--    when KickoffButton reads them and finds no custom_field_value,
--    it falls back to the same defaults the old form used.
DO $$
DECLARE
  ws record;
  next_pos integer;
  spec record;
BEGIN
  FOR ws IN SELECT id FROM hiring.workspaces LOOP
    -- Resolve the next free position for this workspace's job defs.
    SELECT COALESCE(MAX(position), -1) + 1
      INTO next_pos
      FROM hiring.custom_field_definitions
      WHERE workspace_id = ws.id
        AND entity_type = 'job';

    FOR spec IN
      SELECT * FROM (VALUES
        ('jd_language',             'Idioma del JD',                  'select',  '["es","en"]'::jsonb),
        ('outreach_language',       'Idioma del Outreach + LinkedIn', 'select',  '["es","en"]'::jsonb),
        ('ai_process_language',     'Idioma del AI process',          'select',  '["es","en"]'::jsonb),
        ('include_salary_in_post',  'Mostrar salario en el anuncio',  'boolean', NULL::jsonb),
        ('include_company_in_post', 'Mostrar empresa en el anuncio',  'boolean', NULL::jsonb),
        ('use_emojis_in_jd',        'Emojis en el JD',                'boolean', NULL::jsonb),
        ('create_assessment',       'Crear Assessment con AI',        'boolean', NULL::jsonb)
      ) AS t(key, label, kind, options)
    LOOP
      -- Idempotent: skip if this workspace already has a def with this key.
      IF EXISTS (
        SELECT 1 FROM hiring.custom_field_definitions
        WHERE workspace_id = ws.id
          AND entity_type = 'job'
          AND key = spec.key
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO hiring.custom_field_definitions
        (workspace_id, entity_type, key, label, kind, options, position,
         is_required, is_filterable, is_visible_in_columns)
      VALUES
        (ws.id, 'job', spec.key, spec.label,
         spec.kind::hiring.custom_field_kind, spec.options,
         next_pos, false, false, false);

      next_pos := next_pos + 1;
    END LOOP;
  END LOOP;
END $$;
