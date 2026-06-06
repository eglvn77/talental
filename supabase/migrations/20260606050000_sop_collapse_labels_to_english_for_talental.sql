-- =====================================================
-- Sync SOP template_json label_es ← label_en for Emanuel's workspace.
--
-- Editor UX changed from two inputs (ES + EN) to one. The single
-- input writes the same string to both columns going forward. This
-- migration brings the already-seeded Talental data into that
-- shape so existing items render the same in both locales without
-- the admin having to re-edit each row.
--
-- Other workspaces keep their existing bilingual labels — only the
-- Talental SOP is touched.
-- =====================================================

UPDATE hiring.resource_definitions
SET template_json = jsonb_build_object(
  'phases', (
    SELECT jsonb_agg(
      jsonb_set(p, '{label_es}', p->'label_en')
    )
    FROM jsonb_array_elements(template_json->'phases') p
  ),
  'items', (
    SELECT jsonb_agg(
      jsonb_set(i, '{label_es}', i->'label_en')
    )
    FROM jsonb_array_elements(template_json->'items') i
  )
)
WHERE workspace_id = 'd121441d-9dc8-4b4f-bd2c-bc6472635b69'
  AND key = 'sop';
