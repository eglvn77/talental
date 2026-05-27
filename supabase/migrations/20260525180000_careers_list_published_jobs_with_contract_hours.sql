-- Extend the public list RPC with contract_type + working_hours so
-- the careers page can offer them as filter facets in the
-- "Filtros" popover. DROP + recreate because Postgres doesn't allow
-- changing the return shape via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS hiring.careers_list_published_jobs(text);

CREATE OR REPLACE FUNCTION hiring.careers_list_published_jobs(
  ws_slug text
)
RETURNS TABLE (
  id uuid, workspace_id uuid, workspace_name text,
  workspace_logo_url text, workspace_accent_color text,
  workspace_careers_tagline text,
  title text, slug text, work_modality text, location text,
  contract_type text, working_hours text,
  show_company_in_posting boolean, company_name text,
  company_logo_url text,
  salary_min numeric, salary_max numeric, salary_currency text,
  salary_frequency text, show_salary_in_posting boolean,
  published_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT
    j.id, j.workspace_id, w.name AS workspace_name,
    w.logo_url AS workspace_logo_url,
    w.accent_color AS workspace_accent_color,
    w.careers_tagline AS workspace_careers_tagline,
    j.title, j.slug, j.work_modality, j.location,
    j.contract_type, j.working_hours,
    j.show_company_in_posting, c.name AS company_name,
    c.logo_url AS company_logo_url,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_frequency,
    j.show_salary_in_posting,
    j.published_at
  FROM hiring.jobs j
  JOIN hiring.workspaces w ON w.id = j.workspace_id
  LEFT JOIN hiring.companies c ON c.id = j.company_id
  WHERE w.slug = ws_slug
    AND j.status = 'activa'
    AND j.publication_status = 'listed'
  ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_list_published_jobs(text)
  TO anon, authenticated;
