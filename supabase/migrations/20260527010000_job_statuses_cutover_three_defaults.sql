-- ============================================================
-- Cutover from enum-based job statuses to the workspace-scoped
-- table. Also rationalizes the defaults from 5 → 3:
--
--   Borrador (work in progress, not yet open)
--   Activa   (actively recruiting; only this one is is_open)
--   Archivada (closed for any reason — replaces 'cubierta',
--              'cancelada', 'por_cerrar')
--
-- jobs.status (enum) is dropped at the end; jobs.status_id (the
-- FK introduced in 20260527000000) becomes the source of truth.
-- ============================================================

INSERT INTO hiring.job_statuses
  (workspace_id, key, label, color, position, is_archived, is_open, is_system)
SELECT id, 'archivada', 'Archivada', '#8E3829', 20, true, false, true
FROM hiring.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

UPDATE hiring.jobs j
SET status_id = (
  SELECT id FROM hiring.job_statuses
  WHERE workspace_id = j.workspace_id AND key = 'archivada'
)
WHERE status_id IN (
  SELECT id FROM hiring.job_statuses
  WHERE key IN ('por_cerrar','cubierta','cancelada')
);

DELETE FROM hiring.job_statuses
WHERE key IN ('por_cerrar','cubierta','cancelada');

UPDATE hiring.job_statuses SET position = 20 WHERE key = 'archivada';

CREATE OR REPLACE FUNCTION hiring.tg_seed_job_statuses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hiring.job_statuses
    (workspace_id, key, label, color, position, is_archived, is_open, is_system)
  VALUES
    (NEW.id, 'borrador',  'Borrador',  '#94a3b8',  0, false, false, true),
    (NEW.id, 'activa',    'Activa',    '#8e966a', 10, false, true,  true),
    (NEW.id, 'archivada', 'Archivada', '#8E3829', 20, true,  false, true);
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS hiring.careers_list_published_jobs(text);
DROP FUNCTION IF EXISTS hiring.careers_get_published_job(text, text);
DROP FUNCTION IF EXISTS hiring.careers_get_job_custom_fields(text, text);

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
  JOIN hiring.job_statuses js ON js.id = j.status_id
  LEFT JOIN hiring.companies c ON c.id = j.company_id
  WHERE w.slug = ws_slug
    AND js.is_open = true
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
  publication_status hiring.publication_status, status_key text
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
    j.publication_status, js.key AS status_key
  FROM hiring.jobs j
  JOIN hiring.workspaces w ON w.id = j.workspace_id
  JOIN hiring.job_statuses js ON js.id = j.status_id
  LEFT JOIN hiring.companies c ON c.id = j.company_id
  WHERE w.slug = ws_slug AND j.slug = job_slug
    AND js.is_open = true
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
  JOIN hiring.job_statuses js ON js.id = j.status_id
  JOIN hiring.custom_field_definitions d
    ON d.workspace_id = j.workspace_id
   AND d.entity_type = 'job'
   AND d.show_in_postings = true
  LEFT JOIN hiring.custom_field_values v
    ON v.definition_id = d.id AND v.entity_id = j.id
  WHERE w.slug = ws_slug
    AND j.slug = job_slug
    AND js.is_open = true
    AND j.publication_status IN ('listed','unlisted')
  ORDER BY d.position ASC, d.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_job_custom_fields(text, text)
  TO anon, authenticated;

ALTER TABLE hiring.jobs DROP COLUMN status;
DROP TYPE hiring.role_status;
