-- ============================================================
-- Workspace-scoped job statuses.
--
-- Today hiring.role_status is a global Postgres enum with five
-- baked-in values. To let each agency customize the lifecycle of
-- their vacantes — rename, recolor, add new states, flag which
-- ones count as "archived" / "open" — we promote it to a per-
-- workspace table. This commit puts the table in place + backfills
-- jobs.status_id alongside the existing enum column. App code
-- keeps reading the enum for now; a follow-up commit cuts over.
-- ============================================================

CREATE TABLE hiring.job_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  -- Slug-like id for system rows (mirrors the old enum values so the
  -- backfill below is trivial). Custom rows can use any slug.
  key text NOT NULL,
  label text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  -- is_archived → terminal lifecycle state. Drives the template-edit
  --                propagation scope (archived vacantes keep their
  --                historical pipeline snapshot).
  -- is_open    → the vacante is actively accepting candidates. The
  --                careers route shows publications only when their
  --                job's status row has is_open = true.
  -- is_system  → row was seeded by the platform. Can be edited but
  --                not deleted (UI gate + maybe DB trigger later).
  is_archived boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE INDEX job_statuses_workspace_position_idx
  ON hiring.job_statuses (workspace_id, position);

ALTER TABLE hiring.job_statuses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON hiring.job_statuses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.job_statuses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hiring.job_statuses TO service_role;

CREATE POLICY tenant_select ON hiring.job_statuses
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.job_statuses
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.job_statuses
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.job_statuses
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

INSERT INTO hiring.job_statuses
  (workspace_id, key, label, color, position, is_archived, is_open, is_system)
SELECT w.id, k.key, k.label, k.color, k.position, k.is_archived, k.is_open, true
FROM hiring.workspaces w
CROSS JOIN (
  VALUES
    ('borrador',   'Borrador',   '#94a3b8',  0, false, false),
    ('activa',     'Activa',     '#8e966a', 10, false, true),
    ('por_cerrar', 'Por cerrar', '#d4a017', 20, false, false),
    ('cubierta',   'Cubierta',   '#22c55e', 30, true,  false),
    ('cancelada',  'Cancelada',  '#8E3829', 40, true,  false)
) AS k(key, label, color, position, is_archived, is_open)
ON CONFLICT (workspace_id, key) DO NOTHING;

CREATE OR REPLACE FUNCTION hiring.tg_seed_job_statuses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hiring.job_statuses
    (workspace_id, key, label, color, position, is_archived, is_open, is_system)
  VALUES
    (NEW.id, 'borrador',   'Borrador',   '#94a3b8',  0, false, false, true),
    (NEW.id, 'activa',     'Activa',     '#8e966a', 10, false, true,  true),
    (NEW.id, 'por_cerrar', 'Por cerrar', '#d4a017', 20, false, false, true),
    (NEW.id, 'cubierta',   'Cubierta',   '#22c55e', 30, true,  false, true),
    (NEW.id, 'cancelada',  'Cancelada',  '#8E3829', 40, true,  false, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_job_statuses ON hiring.workspaces;
CREATE TRIGGER workspaces_seed_job_statuses
  AFTER INSERT ON hiring.workspaces
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_seed_job_statuses();

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS status_id uuid
  REFERENCES hiring.job_statuses(id) ON DELETE RESTRICT;

UPDATE hiring.jobs j
SET status_id = js.id
FROM hiring.job_statuses js
WHERE js.workspace_id = j.workspace_id
  AND js.key = j.status::text
  AND j.status_id IS NULL;

ALTER TABLE hiring.jobs ALTER COLUMN status_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_status_id_idx ON hiring.jobs (status_id);
