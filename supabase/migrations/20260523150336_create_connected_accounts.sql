-- =====================================================
-- hiring.connected_accounts — Unipile-managed channels per ATS user.
--
-- Each row maps a (user, workspace, provider) tuple to a Unipile-side
-- `account_id`. Multiple accounts per user are allowed (a single user
-- can connect personal LinkedIn + work Gmail + a WhatsApp number).
-- The Unipile account_id is the foreign key into the Unipile platform
-- — webhooks reference it, our outbound calls use it.
--
-- Lifecycle:
--   1. User clicks "Conectar nueva cuenta" → server calls Unipile's
--      Hosted Auth Wizard → user authenticates with the provider.
--   2. Unipile fires the account-callback webhook with status
--      CREATION_SUCCESS or RECONNECTED → we INSERT/UPDATE this table.
--   3. Status changes from Unipile (CREDENTIALS expired, DISCONNECTED,
--      ERROR) flow through the status-changes webhook → UPDATE here.
--
-- RLS is workspace-scoped following the existing pattern. A user can
-- only see accounts in workspaces they belong to. user_id is recorded
-- for accountability (whose Gmail is this?) but workspace_id is what
-- the policies gate on.
-- =====================================================

CREATE TABLE hiring.connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN (
    'LINKEDIN', 'WHATSAPP', 'GOOGLE', 'OUTLOOK', 'IMAP',
    'INSTAGRAM', 'TELEGRAM'
  )),
  -- NULL while a row is PENDING (the webhook callback hasn't fired
  -- yet). UNIQUE treats NULLs as distinct in Postgres, so multiple
  -- pending rows from the same user are fine. Becomes non-NULL once
  -- Unipile confirms the account.
  unipile_account_id text UNIQUE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'OK', 'CREDENTIALS', 'DISCONNECTED', 'ERROR'
  )),
  last_status_update timestamptz NOT NULL DEFAULT now(),
  -- Free-form per-provider metadata. Schema differs by provider:
  --   GOOGLE/OUTLOOK/IMAP: { email, display_name }
  --   WHATSAPP: { phone, display_name }
  --   LINKEDIN: { linkedin_id, public_id, name, headline }
  account_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot lookup #1: list a user's accounts in the current workspace
-- (settings page query).
CREATE INDEX connected_accounts_user_workspace_idx
  ON hiring.connected_accounts (user_id, workspace_id);

-- Hot lookup #2: webhooks dereference the Unipile id back to the row
-- to UPDATE. Already UNIQUE so an index is implicit, but naming it
-- makes the intent explicit.
CREATE INDEX connected_accounts_unipile_id_idx
  ON hiring.connected_accounts (unipile_account_id)
  WHERE unipile_account_id IS NOT NULL;

ALTER TABLE hiring.connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON hiring.connected_accounts FOR SELECT
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_insert ON hiring.connected_accounts FOR INSERT
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_update ON hiring.connected_accounts FOR UPDATE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT hiring.user_workspace_ids()));
CREATE POLICY tenant_delete ON hiring.connected_accounts FOR DELETE
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

-- MCP-created tables don't auto-grant. Explicit GRANTs follow the
-- pattern in 20260523010406_sourcing_cache_layer_schema.sql.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE hiring.connected_accounts
  TO authenticated, service_role;
