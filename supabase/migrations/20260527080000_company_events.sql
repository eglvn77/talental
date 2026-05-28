-- Activity log for the company entity. Powers the "Actividad" section
-- at the bottom of the company slideover. Insert-only from app actions
-- (no UI for editing/deleting events — these are an audit trail).
--
-- Kept narrow on purpose: just a `kind` discriminator + a human-ready
-- `summary` + an optional `payload` (jsonb) for future detail rendering.
-- Avoids the trap of building a fully-generic event bus when only one
-- entity needs it today.

CREATE TABLE IF NOT EXISTS hiring.company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL
    REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL
    REFERENCES hiring.companies(id) ON DELETE CASCADE,
  actor_team_member_id uuid
    REFERENCES hiring.team_members(id) ON DELETE SET NULL,
  -- Free-form discriminator. Current kinds:
  --   'created' | 'updated' | 'status_changed'
  -- More can land without a schema change.
  kind text NOT NULL,
  -- Pre-rendered short string, ES copy, ready for the activity feed.
  summary text NOT NULL,
  -- Optional structured detail for future expand-on-click rendering.
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_events_company_idx
  ON hiring.company_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS company_events_workspace_idx
  ON hiring.company_events (workspace_id, created_at DESC);

ALTER TABLE hiring.company_events ENABLE ROW LEVEL SECURITY;

-- Any team member of the workspace can read the activity.
CREATE POLICY tenant_select ON hiring.company_events
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- Inserts only from admin-gated server actions in the app. Lets us
-- skip the auth-check noise inside hot paths — RLS enforces it.
CREATE POLICY tenant_insert ON hiring.company_events
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- No update / delete policies — events are immutable.

GRANT SELECT, INSERT ON hiring.company_events TO authenticated;
GRANT ALL ON hiring.company_events TO service_role;
