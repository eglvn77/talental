-- ============================================================
-- Switch careers RPCs from slug params to UUID params.
--
-- Rationale: agency-level slug collisions are possible across
-- workspaces, and job slugs change whenever a title is edited —
-- which would silently invalidate every public link the recruiter
-- already shared. UUIDs are permanent until the job is deleted,
-- which is what we want for "publica un link y compártelo".
--
-- Slugs stay in the DB for now (useful for analytics + a future
-- pretty-URL redirect layer) but are no longer the public
-- identifier. The RPCs below match by ID and ignore the slug.
-- ============================================================

DROP FUNCTION IF EXISTS hiring.careers_get_workspace_header(text);
DROP FUNCTION IF EXISTS hiring.careers_list_published_jobs(text);
DROP FUNCTION IF EXISTS hiring.careers_get_published_job(text, text);
DROP FUNCTION IF EXISTS hiring.careers_get_job_custom_fields(text, text);

CREATE OR REPLACE FUNCTION hiring.careers_get_workspace_header(
  ws_id uuid
)
RETURNS TABLE (
  id uuid, name text, logo_url text, accent_color text,
  careers_tagline text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT id, name, logo_url, accent_color, careers_tagline
  FROM hiring.workspaces WHERE id = ws_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_workspace_header(uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION hiring.careers_list_published_jobs(
  ws_id uuid
)
RETURNS TABLE (
  id uuid, workspace_id uuid, workspace_name text,
  workspace_logo_url text, workspace_accent_color text,
  workspace_careers_tagline text,
  title text, slug text, work_modality text, location text,
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
    j.show_company_in_posting, c.name AS company_name,
    c.logo_url AS company_logo_url,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_frequency,
    j.show_salary_in_posting,
    j.published_at
  FROM hiring.jobs j
  JOIN hiring.workspaces w ON w.id = j.workspace_id
  LEFT JOIN hiring.companies c ON c.id = j.company_id
  WHERE j.workspace_id = ws_id
    AND j.status = 'activa'
    AND j.publication_status = 'listed'
  ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_list_published_jobs(uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION hiring.careers_get_published_job(
  ws_id uuid, job_id uuid
)
RETURNS TABLE (
  id uuid, workspace_id uuid, workspace_name text,
  workspace_logo_url text, workspace_accent_color text,
  workspace_careers_tagline text,
  title text, slug text, posting_language text, work_modality text,
  location text, contract_type text, working_hours text,
  salary_min numeric, salary_max numeric, salary_currency text,
  salary_frequency text, show_salary_in_posting boolean,
  show_company_in_posting boolean,
  company_name text, company_logo_url text, company_domain text,
  public_description text, require_cv boolean, ask_for_location boolean,
  ask_for_salary_expectations boolean, screening_questions jsonb,
  publication_status hiring.publication_status, status hiring.role_status
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT
    j.id, j.workspace_id, w.name AS workspace_name,
    w.logo_url AS workspace_logo_url,
    w.accent_color AS workspace_accent_color,
    w.careers_tagline AS workspace_careers_tagline,
    j.title, j.slug, j.posting_language, j.work_modality, j.location,
    j.contract_type, j.working_hours,
    j.salary_min, j.salary_max, j.salary_currency, j.salary_frequency,
    j.show_salary_in_posting, j.show_company_in_posting,
    c.name AS company_name, c.logo_url AS company_logo_url,
    c.domain AS company_domain,
    j.public_description,
    j.require_cv, j.ask_for_location, j.ask_for_salary_expectations,
    j.screening_questions,
    j.publication_status, j.status
  FROM hiring.jobs j
  JOIN hiring.workspaces w ON w.id = j.workspace_id
  LEFT JOIN hiring.companies c ON c.id = j.company_id
  WHERE j.workspace_id = ws_id AND j.id = job_id
    AND j.status = 'activa'
    AND j.publication_status IN ('listed','unlisted');
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_published_job(uuid, uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION hiring.careers_get_job_custom_fields(
  ws_id uuid,
  job_id uuid
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
  JOIN hiring.custom_field_definitions d
    ON d.workspace_id = j.workspace_id
   AND d.entity_type = 'job'
   AND d.show_in_postings = true
  LEFT JOIN hiring.custom_field_values v
    ON v.definition_id = d.id AND v.entity_id = j.id
  WHERE j.workspace_id = ws_id
    AND j.id = job_id
    AND j.status = 'activa'
    AND j.publication_status IN ('listed','unlisted')
  ORDER BY d.position ASC, d.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_job_custom_fields(uuid, uuid)
  TO anon, authenticated;
