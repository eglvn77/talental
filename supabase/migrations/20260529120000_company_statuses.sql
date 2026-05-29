-- ============================================================
-- Workspace-scoped company statuses (mirror of job_statuses).
--
-- Today hiring.company_status is a global Postgres enum with four
-- baked-in values (client / prospect / partner / none). Display
-- overrides (label + color) live in workspaces.company_status_config
-- (jsonb), but the SET of statuses is fixed — you can't add new ones.
--
-- To let each agency add custom CRM classifications, we promote the
-- enum to a per-workspace table. Company statuses are FULLY editable:
-- any row (including the originally-seeded ones) can be renamed,
-- recolored, reordered, or deleted — the only hard guard is the FK
-- below (can't delete a status while companies still reference it) plus
-- an app-level "can't delete the last remaining status" check. Unlike
-- job statuses, company statuses have NO behavior/funnel flags — they're
-- flat classifications, so the table only carries label + color +
-- position (+ is_system, kept for record-keeping but NOT used to gate
-- anything).
--
-- companies.status is converted from the enum to a text key that
-- references company_statuses(workspace_id, key). The four enum values
-- become the four system rows' keys, so existing data maps 1:1 with no
-- per-company backfill.
-- ============================================================

-- 1. The table -------------------------------------------------------
CREATE TABLE hiring.company_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  -- Slug-like id. System rows reuse the old enum values so the
  -- companies.status backfill is trivial; custom rows get any slug.
  key text NOT NULL,
  label text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  -- is_system → seeded by the platform. Kept for record-keeping only;
  --              company statuses are fully editable (NOT used to block
  --              renames, recolors, or deletes).
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE INDEX company_statuses_workspace_position_idx
  ON hiring.company_statuses (workspace_id, position);

-- 2. RLS + grants ----------------------------------------------------
-- MCP-created tables don't auto-grant to service_role; be explicit.
ALTER TABLE hiring.company_statuses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.company_statuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.company_statuses TO service_role;

CREATE POLICY tenant_select ON hiring.company_statuses
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.company_statuses
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.company_statuses
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.company_statuses
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- 3. Seed the four system rows for every existing workspace ----------
-- Pull any label/color the admin already set via the jsonb config so
-- renames/recolors survive the migration; fall back to the defaults.
INSERT INTO hiring.company_statuses
  (workspace_id, key, label, color, position, is_system)
SELECT
  w.id,
  k.key,
  COALESCE(
    NULLIF(trim(w.company_status_config -> k.key ->> 'label'), ''),
    k.label
  ),
  COALESCE(
    CASE
      WHEN (w.company_status_config -> k.key ->> 'color') ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'
      THEN (w.company_status_config -> k.key ->> 'color')
    END,
    k.color
  ),
  k.position,
  true
FROM hiring.workspaces w
CROSS JOIN (
  VALUES
    ('client',   'Cliente',   '#547030',  0),
    ('prospect', 'Prospecto', '#b87333', 10),
    ('partner',  'Aliado',    '#6b7548', 20),
    ('none',     'Otra',      '#94a3b8', 30)
) AS k(key, label, color, position)
ON CONFLICT (workspace_id, key) DO NOTHING;

-- 4. Auto-seed the four system rows for every NEW workspace ----------
CREATE OR REPLACE FUNCTION hiring.tg_seed_company_statuses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hiring.company_statuses
    (workspace_id, key, label, color, position, is_system)
  VALUES
    (NEW.id, 'client',   'Cliente',   '#547030',  0, true),
    (NEW.id, 'prospect', 'Prospecto', '#b87333', 10, true),
    (NEW.id, 'partner',  'Aliado',    '#6b7548', 20, true),
    (NEW.id, 'none',     'Otra',      '#94a3b8', 30, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_company_statuses ON hiring.workspaces;
CREATE TRIGGER workspaces_seed_company_statuses
  AFTER INSERT ON hiring.workspaces
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_seed_company_statuses();

-- 5. Convert companies.status: enum → text key ----------------------
-- The enum values equal the new keys, so ::text is a lossless cast.
-- The plain btree index on status is rebuilt automatically by the
-- type change; no partial index references the enum.
--
-- We DROP the DB-level default ('none') and do NOT re-add one: since
-- 'none' is now a deletable row, a hardcoded default could dangle. The
-- column stays NOT NULL, so every insert must supply a status — the app
-- resolves the workspace's default (first row by position) for the two
-- insert paths (createCompanyAction + persistCompany).
ALTER TABLE hiring.companies ALTER COLUMN status DROP DEFAULT;
ALTER TABLE hiring.companies
  ALTER COLUMN status TYPE text USING status::text;

-- 6. Referential integrity: a company's (workspace, status) must be a
-- real status row. ON UPDATE CASCADE keeps companies in sync if a key
-- is ever renamed; ON DELETE RESTRICT blocks deleting an in-use status
-- (the app also guards this server-side with a friendlier message).
ALTER TABLE hiring.companies
  ADD CONSTRAINT companies_status_fk
  FOREIGN KEY (workspace_id, status)
  REFERENCES hiring.company_statuses (workspace_id, key)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- 7. The hiring.company_status enum type is now unused. We keep it in
-- place (dropping it is a separate, reversible cleanup) so nothing that
-- might still reference the type name at deploy time breaks.
COMMENT ON TYPE hiring.company_status IS
  'DEPRECATED: company statuses moved to hiring.company_statuses table (2026-05-29). Type retained but unused.';
