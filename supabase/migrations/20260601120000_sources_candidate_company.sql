-- ============================================================
-- Workspace-scoped "Source / Origen" lists for candidates and
-- companies. Hard-coded field, but the OPTIONS are fully editable per
-- workspace (rename / recolor / reorder / delete), mirroring the
-- company_statuses pattern. Separate lists per scope ('candidate' vs
-- 'company'). Optional everywhere (nullable FK).
-- ============================================================

CREATE TABLE hiring.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('candidate', 'company')),
  -- Slug. System rows reuse stable keys (linkedin/indeed/careers/...) so
  -- careers tracking links can map ?src=<key> → source.
  key text NOT NULL,
  label text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, scope, key)
);

CREATE INDEX sources_workspace_scope_position_idx
  ON hiring.sources (workspace_id, scope, position);

ALTER TABLE hiring.sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.sources TO service_role;

CREATE POLICY tenant_select ON hiring.sources
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.sources
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.sources
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.sources
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- Seed default rows for every existing workspace --------------------
INSERT INTO hiring.sources (workspace_id, scope, key, label, color, position, is_system)
SELECT w.id, s.scope, s.key, s.label, s.color, s.position, true
FROM hiring.workspaces w
CROSS JOIN (
  VALUES
    ('candidate', 'linkedin', 'LinkedIn', '#0a66c2',  0),
    ('candidate', 'indeed',   'Indeed',   '#2164f3', 10),
    ('candidate', 'referral', 'Referido', '#547030', 20),
    ('candidate', 'careers',  'Página de carreras', '#b87333', 30),
    ('candidate', 'direct',   'Directo',  '#6b7548', 40),
    ('candidate', 'other',    'Otro',     '#94a3b8', 50),
    ('company',   'inbound',  'Inbound',  '#547030',  0),
    ('company',   'outbound', 'Outbound', '#0a66c2', 10),
    ('company',   'referral', 'Referido', '#b87333', 20),
    ('company',   'event',    'Evento',   '#6b7548', 30),
    ('company',   'other',    'Otro',     '#94a3b8', 40)
) AS s(scope, key, label, color, position)
ON CONFLICT (workspace_id, scope, key) DO NOTHING;

-- Auto-seed for new workspaces --------------------------------------
CREATE OR REPLACE FUNCTION hiring.tg_seed_sources()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hiring.sources (workspace_id, scope, key, label, color, position, is_system)
  VALUES
    (NEW.id, 'candidate', 'linkedin', 'LinkedIn', '#0a66c2',  0, true),
    (NEW.id, 'candidate', 'indeed',   'Indeed',   '#2164f3', 10, true),
    (NEW.id, 'candidate', 'referral', 'Referido', '#547030', 20, true),
    (NEW.id, 'candidate', 'careers',  'Página de carreras', '#b87333', 30, true),
    (NEW.id, 'candidate', 'direct',   'Directo',  '#6b7548', 40, true),
    (NEW.id, 'candidate', 'other',    'Otro',     '#94a3b8', 50, true),
    (NEW.id, 'company',   'inbound',  'Inbound',  '#547030',  0, true),
    (NEW.id, 'company',   'outbound', 'Outbound', '#0a66c2', 10, true),
    (NEW.id, 'company',   'referral', 'Referido', '#b87333', 20, true),
    (NEW.id, 'company',   'event',    'Evento',   '#6b7548', 30, true),
    (NEW.id, 'company',   'other',    'Otro',     '#94a3b8', 40, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_sources ON hiring.workspaces;
CREATE TRIGGER workspaces_seed_sources
  AFTER INSERT ON hiring.workspaces
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_seed_sources();

-- FK columns on candidates + companies (nullable / optional) --------
ALTER TABLE hiring.candidates
  ADD COLUMN source_id uuid REFERENCES hiring.sources(id) ON DELETE SET NULL;
ALTER TABLE hiring.companies
  ADD COLUMN source_id uuid REFERENCES hiring.sources(id) ON DELETE SET NULL;

CREATE INDEX candidates_source_id_idx ON hiring.candidates (source_id);
CREATE INDEX companies_source_id_idx ON hiring.companies (source_id);
