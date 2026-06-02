-- ============================================================
-- Per-vacante tracking links. Each row is a shareable careers link
-- (carrying a unique ?src=<token>) tied to a candidate Source, so the
-- recruiter knows which channel an applicant came from. A job can have
-- as many as they want (e.g. one per channel/campaign).
-- ============================================================

CREATE TABLE hiring.job_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES hiring.jobs(id) ON DELETE CASCADE,
  source_id uuid REFERENCES hiring.sources(id) ON DELETE SET NULL,
  token text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, token)
);

CREATE INDEX job_tracking_links_job_idx ON hiring.job_tracking_links (job_id);

ALTER TABLE hiring.job_tracking_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.job_tracking_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.job_tracking_links TO service_role;

CREATE POLICY tenant_select ON hiring.job_tracking_links
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.job_tracking_links
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.job_tracking_links
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.job_tracking_links
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );
