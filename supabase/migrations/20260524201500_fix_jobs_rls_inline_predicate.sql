-- ============================================================
-- Bugfix: INSERT ... RETURNING on hiring.jobs failed with
-- "new row violates row-level security policy for table jobs"
-- even when the WITH CHECK clause clearly passed.
--
-- Root cause: the SELECT policy used `id IN (SELECT
-- hiring.user_visible_job_ids())`. That helper itself SELECTs
-- from hiring.jobs, so during the RETURNING-phase visibility
-- check Postgres evaluated the helper against a snapshot that
-- did NOT include the row being inserted -> the new id wasn't
-- in the helper's output -> SELECT policy failed -> insert
-- got rolled back with the misleading "violates RLS" message.
--
-- Fix: inline the predicate directly on each policy, testing
-- the row's own columns (workspace_id, recruiter_team_member_id)
-- instead of re-querying jobs. Same access semantics, but no
-- self-reference and no snapshot footgun.
--
-- The helpers (user_visible_job_ids / user_visible_candidate_ids)
-- stay around for app-side joins where re-querying jobs is
-- harmless and the inline form would force the same predicate
-- to be duplicated all over the codebase.
-- ============================================================

-- jobs
DROP POLICY IF EXISTS tenant_select ON hiring.jobs;
DROP POLICY IF EXISTS tenant_update ON hiring.jobs;
DROP POLICY IF EXISTS tenant_delete ON hiring.jobs;

CREATE POLICY tenant_select ON hiring.jobs FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR recruiter_team_member_id = hiring.current_team_member_id()
    )
  );

CREATE POLICY tenant_update ON hiring.jobs FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR recruiter_team_member_id = hiring.current_team_member_id()
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR recruiter_team_member_id = hiring.current_team_member_id()
    )
  );

CREATE POLICY tenant_delete ON hiring.jobs FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- candidates: same self-reference bug via user_visible_candidate_ids.
DROP POLICY IF EXISTS tenant_select ON hiring.candidates;
DROP POLICY IF EXISTS tenant_update ON hiring.candidates;
DROP POLICY IF EXISTS tenant_delete ON hiring.candidates;

CREATE POLICY tenant_select ON hiring.candidates FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR created_by_team_member_id = hiring.current_team_member_id()
      OR EXISTS (
        SELECT 1
        FROM hiring.applications a
        WHERE a.candidate_id = hiring.candidates.id
          AND a.job_id IN (
            SELECT j.id
            FROM hiring.jobs j
            WHERE j.workspace_id IN (SELECT hiring.user_workspace_ids())
              AND j.recruiter_team_member_id = hiring.current_team_member_id()
          )
      )
    )
  );

CREATE POLICY tenant_update ON hiring.candidates FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR created_by_team_member_id = hiring.current_team_member_id()
      OR EXISTS (
        SELECT 1
        FROM hiring.applications a
        WHERE a.candidate_id = hiring.candidates.id
          AND a.job_id IN (
            SELECT j.id
            FROM hiring.jobs j
            WHERE j.workspace_id IN (SELECT hiring.user_workspace_ids())
              AND j.recruiter_team_member_id = hiring.current_team_member_id()
          )
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR created_by_team_member_id = hiring.current_team_member_id()
    )
  );

CREATE POLICY tenant_delete ON hiring.candidates FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );
