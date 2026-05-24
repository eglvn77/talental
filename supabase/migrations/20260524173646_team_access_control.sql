-- =====================================================
-- Team access control — role-based RLS for hiring.* tables
--
-- Goal: workspace admins (team_role IN owner|admin) keep full
-- access to every vacante / candidato / event in their workspace.
-- Recruiters (team_role = recruiter) see only what's assigned:
--
--   * jobs                — only jobs.recruiter_team_member_id = me
--   * applications        — only on those jobs
--   * pipeline_stages     — only on those jobs
--   * application_events  — only on applications on those jobs
--   * candidates          — Q1 option C: candidates I created OR
--                            with at least one application in my
--                            assigned jobs
--   * notes / entity_tags — gated by the entity they attach to
--                            (jobs/applications/candidates as
--                            above; companies/contacts workspace-
--                            wide; deals admin-only)
--   * deals               — admin-only for now (Q2/Q3)
--
-- Workspace-shared (no role gating): companies, contacts, tags,
-- team_members (read), rejection_reasons.
-- =====================================================

-- ---------- HELPERS ----------

-- Returns the current user's active team_member row id, or NULL
-- when the JWT doesn't map to any active membership. STABLE +
-- SECURITY DEFINER so RLS policies can use it without recursion.
CREATE OR REPLACE FUNCTION hiring.current_team_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM hiring.team_members
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- True if the current user holds owner|admin in any of their
-- active workspaces. Combine with workspace_id checks in policies
-- so cross-workspace admin doesn't leak.
CREATE OR REPLACE FUNCTION hiring.is_workspace_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM hiring.team_members
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND team_role IN ('owner', 'admin')
  );
$$;

-- Job ids the current user can see. Admins → every job in their
-- workspaces. Recruiters → only jobs where they're the assigned
-- recruiter_team_member_id. (When we add multi-assignment later
-- this is the function to extend.)
CREATE OR REPLACE FUNCTION hiring.user_visible_job_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT j.id
  FROM hiring.jobs j
  WHERE j.workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR j.recruiter_team_member_id = hiring.current_team_member_id()
    );
$$;

-- ---------- candidates.created_by_team_member_id ----------
-- Tracks which team member added the candidate to the talent pool.
-- Drives Q1 option C: recruiters see the candidates they personally
-- created plus the ones with applications on their assigned jobs.
-- Existing rows get NULL; only admins can see them until they're
-- linked to a recruiter via an application.

ALTER TABLE hiring.candidates
  ADD COLUMN IF NOT EXISTS created_by_team_member_id uuid
    REFERENCES hiring.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS candidates_created_by_team_member_idx
  ON hiring.candidates (created_by_team_member_id)
  WHERE created_by_team_member_id IS NOT NULL;

-- Candidate ids the current user can see. Admins → everything.
-- Recruiters → created by me OR has an application in my jobs.
CREATE OR REPLACE FUNCTION hiring.user_visible_candidate_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM hiring.candidates c
  WHERE c.workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR c.created_by_team_member_id = hiring.current_team_member_id()
      OR EXISTS (
        SELECT 1 FROM hiring.applications a
        WHERE a.candidate_id = c.id
          AND a.job_id IN (SELECT hiring.user_visible_job_ids())
      )
    );
$$;

-- Entity-aware visibility check, used by notes + entity_tags so
-- their policies can dispatch on entity_type without duplicating
-- the per-table logic above.
CREATE OR REPLACE FUNCTION hiring.entity_visible(entity_type hiring.entity_type, entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE entity_type
    WHEN 'application' THEN EXISTS (
      SELECT 1 FROM hiring.applications a
      WHERE a.id = entity_id
        AND a.job_id IN (SELECT hiring.user_visible_job_ids())
    )
    WHEN 'candidate' THEN entity_id IN (SELECT hiring.user_visible_candidate_ids())
    WHEN 'job' THEN entity_id IN (SELECT hiring.user_visible_job_ids())
    WHEN 'company' THEN EXISTS (
      SELECT 1 FROM hiring.companies x
      WHERE x.id = entity_id
        AND x.workspace_id IN (SELECT hiring.user_workspace_ids())
    )
    WHEN 'contact' THEN EXISTS (
      SELECT 1 FROM hiring.contacts x
      WHERE x.id = entity_id
        AND x.workspace_id IN (SELECT hiring.user_workspace_ids())
    )
    WHEN 'deal' THEN hiring.is_workspace_admin() AND EXISTS (
      SELECT 1 FROM hiring.deals d
      WHERE d.id = entity_id
        AND d.workspace_id IN (SELECT hiring.user_workspace_ids())
    )
    ELSE FALSE
  END;
$$;

-- ---------- RLS POLICY UPDATES ----------
-- Drop every existing policy on the affected tables and recreate
-- with the role-aware shape. The old policies were uniformly named
-- `tenant_<verb>`; the new ones keep the same names so future
-- migrations/inventories find them under a predictable handle.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'hiring'
      AND tablename IN (
        'jobs', 'applications', 'candidates', 'pipeline_stages',
        'application_events', 'notes', 'entity_tags', 'deals'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON hiring.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ----- jobs -----
CREATE POLICY tenant_select ON hiring.jobs FOR SELECT TO authenticated
  USING (id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_insert ON hiring.jobs FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.jobs FOR UPDATE TO authenticated
  USING (id IN (SELECT hiring.user_visible_job_ids()))
  WITH CHECK (id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_delete ON hiring.jobs FOR DELETE TO authenticated
  USING (
    id IN (SELECT hiring.user_visible_job_ids())
    AND hiring.is_workspace_admin()
  );

-- ----- applications -----
CREATE POLICY tenant_select ON hiring.applications FOR SELECT TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_insert ON hiring.applications FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND job_id IN (SELECT hiring.user_visible_job_ids())
  );

CREATE POLICY tenant_update ON hiring.applications FOR UPDATE TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()))
  WITH CHECK (job_id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_delete ON hiring.applications FOR DELETE TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()));

-- ----- candidates -----
CREATE POLICY tenant_select ON hiring.candidates FOR SELECT TO authenticated
  USING (id IN (SELECT hiring.user_visible_candidate_ids()));

-- Anyone authenticated in the workspace can add a candidate to the
-- pool — recruiters and admins alike. The candidate becomes visible
-- to them through the created_by branch of user_visible_candidate_ids.
CREATE POLICY tenant_insert ON hiring.candidates FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_update ON hiring.candidates FOR UPDATE TO authenticated
  USING (id IN (SELECT hiring.user_visible_candidate_ids()))
  WITH CHECK (id IN (SELECT hiring.user_visible_candidate_ids()));

CREATE POLICY tenant_delete ON hiring.candidates FOR DELETE TO authenticated
  USING (id IN (SELECT hiring.user_visible_candidate_ids()));

-- ----- pipeline_stages -----
CREATE POLICY tenant_select ON hiring.pipeline_stages FOR SELECT TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_insert ON hiring.pipeline_stages FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND job_id IN (SELECT hiring.user_visible_job_ids())
  );

CREATE POLICY tenant_update ON hiring.pipeline_stages FOR UPDATE TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()))
  WITH CHECK (job_id IN (SELECT hiring.user_visible_job_ids()));

CREATE POLICY tenant_delete ON hiring.pipeline_stages FOR DELETE TO authenticated
  USING (job_id IN (SELECT hiring.user_visible_job_ids()));

-- ----- application_events -----
CREATE POLICY tenant_select ON hiring.application_events FOR SELECT TO authenticated
  USING (
    application_id IN (
      SELECT id FROM hiring.applications
      WHERE job_id IN (SELECT hiring.user_visible_job_ids())
    )
  );

CREATE POLICY tenant_insert ON hiring.application_events FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND application_id IN (
      SELECT id FROM hiring.applications
      WHERE job_id IN (SELECT hiring.user_visible_job_ids())
    )
  );

CREATE POLICY tenant_update ON hiring.application_events FOR UPDATE TO authenticated
  USING (
    application_id IN (
      SELECT id FROM hiring.applications
      WHERE job_id IN (SELECT hiring.user_visible_job_ids())
    )
  )
  WITH CHECK (
    application_id IN (
      SELECT id FROM hiring.applications
      WHERE job_id IN (SELECT hiring.user_visible_job_ids())
    )
  );

CREATE POLICY tenant_delete ON hiring.application_events FOR DELETE TO authenticated
  USING (
    application_id IN (
      SELECT id FROM hiring.applications
      WHERE job_id IN (SELECT hiring.user_visible_job_ids())
    )
  );

-- ----- notes -----
CREATE POLICY tenant_select ON hiring.notes FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_insert ON hiring.notes FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_update ON hiring.notes FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_delete ON hiring.notes FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

-- ----- entity_tags -----
CREATE POLICY tenant_select ON hiring.entity_tags FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_insert ON hiring.entity_tags FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_update ON hiring.entity_tags FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

CREATE POLICY tenant_delete ON hiring.entity_tags FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.entity_visible(entity_type, entity_id)
  );

-- ----- deals — admin-only for now -----
CREATE POLICY tenant_select ON hiring.deals FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_insert ON hiring.deals FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.deals FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.deals FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- ---------- GRANTs ----------

GRANT EXECUTE ON FUNCTION hiring.current_team_member_id()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hiring.is_workspace_admin()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hiring.user_visible_job_ids()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hiring.user_visible_candidate_ids()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hiring.entity_visible(hiring.entity_type, uuid) TO authenticated, service_role;
