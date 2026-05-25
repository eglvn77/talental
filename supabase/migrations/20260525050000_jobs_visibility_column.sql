-- Project-style visibility flag on each vacante.
--   private (default) — only admins + the assigned recruiter can
--                       see the row. Today's behaviour, preserved.
--   team              — everyone in the workspace can read the row,
--                       even if not the assigned recruiter. Writes
--                       still gated by admin / assignment.
--
-- Extends the SELECT RLS so recruiters who are NOT assigned can
-- still open a team-visible vacante. UPDATE / DELETE policies stay
-- as-is (admin only for delete; admin + assigned for update) so
-- widening visibility doesn't accidentally widen edit privileges.

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

ALTER TABLE hiring.jobs
  DROP CONSTRAINT IF EXISTS jobs_visibility_check;
ALTER TABLE hiring.jobs
  ADD CONSTRAINT jobs_visibility_check
    CHECK (visibility IN ('private','team'));

DROP POLICY IF EXISTS tenant_select ON hiring.jobs;
CREATE POLICY tenant_select ON hiring.jobs FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND (
      hiring.is_workspace_admin()
      OR recruiter_team_member_id = hiring.current_team_member_id()
      OR visibility = 'team'
    )
  );
