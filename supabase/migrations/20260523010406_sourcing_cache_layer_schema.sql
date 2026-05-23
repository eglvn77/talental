-- =====================================================
-- Sourcing cache layer: schema for cache-first DataForB2B integration.
--
-- Strategy: Supabase is the source of truth. Every API call to
-- DataForB2B writes results back here. Subsequent reads check
-- freshness (per-data-type TTL) before re-calling the API.
--
-- Multi-tenancy: every new tenant table carries workspace_id; RLS
-- policies follow the existing pattern
--   workspace_id IN (SELECT hiring.user_workspace_ids()).
--
-- enrichment_config is intentionally global (system defaults),
-- so no workspace_id + no RLS — readable by all authenticated users.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----- Clean up the pre-existing duplicate candidate row -----
-- The "Emanuel Candidato" test row collided with Gonzalo Sestopal on
-- linkedin_url. Verified above: it has NO FK relations (0 apps, 0
-- conversations). Safe to delete; no merge needed.
DELETE FROM hiring.candidates
  WHERE id = '271f4c43-e7d5-4a72-853b-a69e855c8e74';

-- ----- candidates: enrichment metadata + denormalized fields -----
ALTER TABLE hiring.candidates
  ADD COLUMN linkedin_public_id text,
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN headline text,
  ADD COLUMN summary text,
  ADD COLUMN country text,
  ADD COLUMN city text,
  ADD COLUMN profile_picture_url text,
  ADD COLUMN current_company_name text,
  ADD COLUMN current_position text,
  ADD COLUMN years_of_experience int,
  ADD COLUMN enriched_at timestamptz,
  ADD COLUMN enrichment_source text,
  ADD COLUMN enrichment_status text DEFAULT 'pending',
  ADD COLUMN next_refresh_at timestamptz,
  ADD COLUMN data_version int DEFAULT 1,
  ADD COLUMN embedding vector(1024),
  ADD COLUMN needs_embedding boolean DEFAULT false;

CREATE UNIQUE INDEX candidates_email_per_workspace
  ON hiring.candidates (workspace_id, email)
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX candidates_linkedin_per_workspace
  ON hiring.candidates (workspace_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL;
CREATE UNIQUE INDEX candidates_linkedin_public_id_per_workspace
  ON hiring.candidates (workspace_id, linkedin_public_id)
  WHERE linkedin_public_id IS NOT NULL;

CREATE INDEX candidates_enriched_at ON hiring.candidates (enriched_at);
CREATE INDEX candidates_next_refresh
  ON hiring.candidates (next_refresh_at)
  WHERE enrichment_status = 'success';
CREATE INDEX candidates_needs_embedding
  ON hiring.candidates (workspace_id)
  WHERE needs_embedding = true;
CREATE INDEX candidates_embedding_ivfflat
  ON hiring.candidates USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ----- companies: complete the spec's enrichment fields -----
ALTER TABLE hiring.companies
  ADD COLUMN funding_stage text,
  ADD COLUMN total_funding_usd numeric,
  ADD COLUMN hq_city text,
  ADD COLUMN hq_country text,
  ADD COLUMN enrichment_source text,
  ADD COLUMN enrichment_status text DEFAULT 'pending',
  ADD COLUMN next_refresh_at timestamptz,
  ADD COLUMN embedding vector(1024),
  ADD COLUMN needs_embedding boolean DEFAULT false;

CREATE INDEX companies_next_refresh
  ON hiring.companies (next_refresh_at)
  WHERE enrichment_status = 'success';
CREATE INDEX companies_needs_embedding
  ON hiring.companies (workspace_id)
  WHERE needs_embedding = true;
CREATE INDEX companies_embedding_ivfflat
  ON hiring.companies USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ----- candidate_experience -----
CREATE TABLE hiring.candidate_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES hiring.candidates(id) ON DELETE CASCADE,
  company_id uuid REFERENCES hiring.companies(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  position text,
  location text,
  start_date date,
  end_date date,
  is_current boolean DEFAULT false,
  description text,
  duration_months int,
  position_idx int,
  enriched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX candidate_experience_candidate ON hiring.candidate_experience (candidate_id, position_idx);
CREATE INDEX candidate_experience_company ON hiring.candidate_experience (company_id);

ALTER TABLE hiring.candidate_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON hiring.candidate_experience FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.candidate_experience FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_update ON hiring.candidate_experience FOR UPDATE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_delete ON hiring.candidate_experience FOR DELETE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ----- candidate_education -----
CREATE TABLE hiring.candidate_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES hiring.candidates(id) ON DELETE CASCADE,
  school text NOT NULL,
  school_logo_url text,
  degree text,
  field_of_study text,
  start_date date,
  end_date date,
  position_idx int,
  enriched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX candidate_education_candidate ON hiring.candidate_education (candidate_id, position_idx);

ALTER TABLE hiring.candidate_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON hiring.candidate_education FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.candidate_education FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_update ON hiring.candidate_education FOR UPDATE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_delete ON hiring.candidate_education FOR DELETE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ----- candidate_skills -----
CREATE TABLE hiring.candidate_skills (
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES hiring.candidates(id) ON DELETE CASCADE,
  skill text NOT NULL,
  PRIMARY KEY (candidate_id, skill)
);

ALTER TABLE hiring.candidate_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON hiring.candidate_skills FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.candidate_skills FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_delete ON hiring.candidate_skills FOR DELETE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ----- search_cache -----
CREATE TABLE hiring.search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  query_normalized text NOT NULL,
  query_embedding vector(1024),
  query_filters jsonb DEFAULT '{}'::jsonb,
  result_candidate_ids uuid[],
  result_company_ids uuid[],
  total_results int,
  credits_used numeric DEFAULT 0,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '14 days')
);
CREATE INDEX search_cache_normalized
  ON hiring.search_cache (workspace_id, query_normalized, expires_at);
CREATE INDEX search_cache_embedding_ivfflat
  ON hiring.search_cache USING ivfflat (query_embedding vector_cosine_ops)
  WITH (lists = 50);
CREATE INDEX search_cache_expires ON hiring.search_cache (expires_at);

ALTER TABLE hiring.search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON hiring.search_cache FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.search_cache FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_update ON hiring.search_cache FOR UPDATE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_delete ON hiring.search_cache FOR DELETE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ----- api_usage_log -----
CREATE TABLE hiring.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  operation_type text NOT NULL,
  resource_external_id text,
  resource_internal_id uuid,
  credits_used numeric NOT NULL DEFAULT 0,
  cost_usd_estimated numeric,
  cache_hit boolean DEFAULT false,
  api_response_status int,
  api_response_time_ms int,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX api_usage_created_at ON hiring.api_usage_log (workspace_id, created_at DESC);
CREATE INDEX api_usage_operation ON hiring.api_usage_log (workspace_id, operation_type, created_at DESC);

ALTER TABLE hiring.api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON hiring.api_usage_log FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.api_usage_log FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- ----- enrichment_config (global system defaults) -----
CREATE TABLE hiring.enrichment_config (
  data_type text PRIMARY KEY,
  ttl_days int NOT NULL,
  description text,
  auto_refresh boolean DEFAULT false
);
INSERT INTO hiring.enrichment_config (data_type, ttl_days, description, auto_refresh) VALUES
  ('profile_basic',          90, 'Nombre, headline, ubicación, foto',            false),
  ('profile_full',           60, 'Experiencia, educación, skills completos',     false),
  ('email_work',             90, 'Email de trabajo verificado',                  false),
  ('email_personal',         90, 'Email personal',                               false),
  ('company_firmographics',  90, 'Datos estructurales de empresa',               false),
  ('company_funding',        60, 'Funding stage y total',                        false),
  ('search_results',         14, 'Cache de búsquedas NL',                        false)
ON CONFLICT (data_type) DO NOTHING;

ALTER TABLE hiring.enrichment_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY anyone_select ON hiring.enrichment_config FOR SELECT
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    hiring.candidate_experience,
    hiring.candidate_education,
    hiring.candidate_skills,
    hiring.search_cache,
    hiring.api_usage_log
  TO authenticated, service_role;
GRANT SELECT ON TABLE hiring.enrichment_config TO authenticated, service_role;
