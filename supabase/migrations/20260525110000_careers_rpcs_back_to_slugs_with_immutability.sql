-- ============================================================
-- Back to slug-based public URLs — with stability guarantees.
--
-- The previous migration moved to UUID URLs to dodge two issues:
--   (a) workspace slug collisions across agencies
--   (b) job slug drift if the recruiter renames the vacante after
--       publishing
--
-- UUIDs solved both but produced unreadable links (two 36-char
-- strings concatenated). Slugs are nicer and shareable on their own
-- ("aquí está nuestra página de carreras: jobs.talental.mx/talental").
--
-- Fix:
--   (a) UNIQUE constraint on workspaces.slug — collisions are now a
--       hard error at signup time; the existing signup flow already
--       appends a numeric suffix to avoid them in practice.
--   (b) Trigger making jobs.slug immutable once set — renaming the
--       title no longer changes the public URL.
-- ============================================================

ALTER TABLE hiring.workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);

CREATE OR REPLACE FUNCTION hiring.tg_jobs_slug_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'jobs.slug is immutable once set (id=%, was=%, attempted=%)',
      OLD.id, OLD.slug, NEW.slug
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_slug_immutable ON hiring.jobs;
CREATE TRIGGER jobs_slug_immutable
  BEFORE UPDATE OF slug ON hiring.jobs
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_jobs_slug_immutable();

-- Revert RPCs to text slug params.
DROP FUNCTION IF EXISTS hiring.careers_get_workspace_header(uuid);
DROP FUNCTION IF EXISTS hiring.careers_list_published_jobs(uuid);
DROP FUNCTION IF EXISTS hiring.careers_get_published_job(uuid, uuid);
DROP FUNCTION IF EXISTS hiring.careers_get_job_custom_fields(uuid, uuid);

CREATE OR REPLACE FUNCTION hiring.careers_get_workspace_header(
  ws_slug text
)
RETURNS TABLE (
  id uuid, name text, logo_url text, accent_color text,
  careers_tagline text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT id, name, logo_url, accent_color, careers_tagline
  FROM hiring.workspaces WHERE slug = ws_slug LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_workspace_header(text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION hiring.careers_list_published_jobs(
  ws_slug text
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
  WHERE w.slug = ws_slug
    AND j.status = 'activa'
    AND j.publication_status = 'listed'
  ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_list_published_jobs(text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION hiring.careers_get_published_job(
  ws_slug text, job_slug text
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
  WHERE w.slug = ws_slug AND j.slug = job_slug
    AND j.status = 'activa'
    AND j.publication_status IN ('listed','unlisted');
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_published_job(text, text)
  TO anon, authenticated;

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
