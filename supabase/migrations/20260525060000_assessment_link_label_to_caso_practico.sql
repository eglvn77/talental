-- Rename the system custom field's label from the technical
-- "Link del assessment" to the friendlier "Link del caso práctico"
-- that recruiters actually use in conversation. Only touches the
-- label — the `key` column stays as `assessment_link` because the
-- AI pipeline reads it by key.
UPDATE hiring.custom_field_definitions
SET label = 'Link del caso práctico'
WHERE entity_type = 'job'
  AND key = 'assessment_link'
  AND is_system = true;
