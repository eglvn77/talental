-- SECURITY DEFINER function for the careers site to read the
-- `show_in_postings=true` custom fields + their values for a single
-- job. Anon doesn't have direct access to custom_field_definitions
-- or custom_field_values; this function exposes only the rows the
-- public posting page should render.
--
-- Gates by the same publishable check as careers_get_published_job
-- so a draft / non-active job can't leak its values either.
--
-- Note: returns the definition's `position` aliased as `ordinal` —
-- `position` is a reserved-ish identifier inside a RETURNS TABLE
-- clause and Postgres bailed on the unaliased form.

CREATE OR REPLACE FUNCTION hiring.careers_get_job_custom_fields(
  ws_slug text,
  job_slug text
)
RETURNS TABLE (
  definition_id uuid,
  key text,
  label text,
  kind hiring.custom_field_kind,
  options jsonb,
  ordinal integer,
  value jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT
    d.id AS definition_id,
    d.key,
    d.label,
    d.kind,
    d.options,
    d.position AS ordinal,
    v.value
  FROM hiring.jobs j
  JOIN hiring.workspaces w ON w.id = j.workspace_id
  JOIN hiring.custom_field_definitions d
    ON d.workspace_id = j.workspace_id
   AND d.entity_type = 'job'
   AND d.show_in_postings = true
  LEFT JOIN hiring.custom_field_values v
    ON v.definition_id = d.id AND v.entity_id = j.id
  WHERE w.slug = ws_slug
    AND j.slug = job_slug
    AND j.status = 'activa'
    AND j.publication_status IN ('listed','unlisted')
  ORDER BY d.position ASC, d.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_job_custom_fields(text, text)
  TO anon, authenticated;
