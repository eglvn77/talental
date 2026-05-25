-- ============================================================
-- Careers site foundations.
--
-- 1) jobs.publication_status enum — orthogonal to jobs.status:
--    status        is the internal lifecycle (borrador / activa /
--                  por_cerrar / cubierta / cancelada).
--    publication_  is the public visibility:
--      status       draft     (default) — never accessible publicly
--                   listed    — appears on the workspace careers
--                               landing + reachable by direct link
--                   unlisted  — direct link only; hidden from the
--                               landing list (a "search-engine-
--                               unlisted" sharing mode)
--
--    Public visibility = status='activa' AND publication_status≠draft.
--
-- 2) jobs.slug — URL-safe identifier used in the careers URL
--    `jobs.talental.mx/<workspace_slug>/<job_slug>`. Generated from
--    the title with a short uuid suffix to avoid collisions; unique
--    per workspace.
--
-- 3) workspaces.logo_url / accent_color / careers_tagline — the
--    public branding the careers landing renders.
--
-- 4) Three SECURITY DEFINER functions exposed to `anon`:
--    careers_get_workspace_header(ws_slug) — header chrome.
--    careers_list_published_jobs(ws_slug)  — landing list.
--    careers_get_published_job(ws_slug, job_slug) — single posting.
--    Anon never touches RLS-scoped jobs/workspaces tables directly;
--    the function gates by status + publication_status so a row that
--    isn't `activa` + non-draft can't leak.
-- ============================================================

CREATE TYPE hiring.publication_status AS ENUM ('draft','listed','unlisted');

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS publication_status hiring.publication_status
    NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE hiring.workspaces
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS careers_tagline text;

CREATE OR REPLACE FUNCTION hiring.careers_slugify(input text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from
    regexp_replace(
      lower(
        translate(input,
          'áéíóúñÁÉÍÓÚÑüÜàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛçÇ',
          'aeiounAEIOUNuUaeiouAEIOUaeiouAEIOUcC'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

UPDATE hiring.jobs
SET slug = hiring.careers_slugify(title) || '-' ||
           substring(id::text from 1 for 6)
WHERE slug IS NULL;

ALTER TABLE hiring.jobs ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_slug_per_workspace
  ON hiring.jobs (workspace_id, slug);

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
