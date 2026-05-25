-- =====================================================
-- Process templates — workspace-managed pipeline blueprints.
--
-- Today every new vacante is seeded with the same hard-coded
-- DEFAULT_PIPELINE_STAGES. Agencies that run multiple types of
-- searches (HH executive, volume, technical) want different
-- pipelines per kind. This migration introduces templates as a
-- first-class entity so:
--
--   1. Admins can craft as many templates as they need (Settings →
--      Procesos, built in a follow-up PR).
--   2. /jobs/new gets a "Proceso" selector — the chosen template's
--      stages get copied into the new vacante's pipeline_stages.
--   3. Each workspace starts with one "Default" template seeded
--      from the existing DEFAULT_PIPELINE_STAGES so behaviour
--      doesn't change for existing users.
--
-- Schema:
--   process_templates       — id, workspace_id, name, description,
--                              is_default, created_at, updated_at,
--                              created_by_team_member_id
--   process_template_stages — id, template_id, name, category,
--                              color, position, is_terminal,
--                              client_portal_visible
--
-- RLS: workspace-scoped reads for any authenticated team member;
-- admin-only writes (same gate as deals / custom_field_definitions).
-- =====================================================

CREATE TABLE IF NOT EXISTS hiring.process_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_team_member_id uuid
    REFERENCES hiring.team_members(id) ON DELETE SET NULL
);

-- One default template per workspace — guarantees /jobs/new always
-- has a sane initial selection.
CREATE UNIQUE INDEX IF NOT EXISTS process_templates_one_default_per_workspace
  ON hiring.process_templates (workspace_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS process_templates_workspace_idx
  ON hiring.process_templates (workspace_id);

CREATE TABLE IF NOT EXISTS hiring.process_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL
    REFERENCES hiring.process_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  category hiring.pipeline_category NOT NULL,
  color text NOT NULL,
  position integer NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  client_portal_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_template_stages_template_idx
  ON hiring.process_template_stages (template_id, position);

ALTER TABLE hiring.process_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring.process_template_stages ENABLE ROW LEVEL SECURITY;

-- ---------- RLS: process_templates ----------
-- Read for any team member in the workspace; write admin-only.

CREATE POLICY tenant_select ON hiring.process_templates
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE POLICY tenant_insert ON hiring.process_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_update ON hiring.process_templates
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  )
  WITH CHECK (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

CREATE POLICY tenant_delete ON hiring.process_templates
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT hiring.user_workspace_ids())
    AND hiring.is_workspace_admin()
  );

-- ---------- RLS: process_template_stages ----------
-- Gated through the parent template's workspace + admin checks.

CREATE POLICY tenant_select ON hiring.process_template_stages
  FOR SELECT TO authenticated
  USING (
    template_id IN (
      SELECT id FROM hiring.process_templates
      WHERE workspace_id IN (SELECT hiring.user_workspace_ids())
    )
  );

CREATE POLICY tenant_insert ON hiring.process_template_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    template_id IN (
      SELECT id FROM hiring.process_templates
      WHERE workspace_id IN (SELECT hiring.user_workspace_ids())
        AND hiring.is_workspace_admin()
    )
  );

CREATE POLICY tenant_update ON hiring.process_template_stages
  FOR UPDATE TO authenticated
  USING (
    template_id IN (
      SELECT id FROM hiring.process_templates
      WHERE workspace_id IN (SELECT hiring.user_workspace_ids())
        AND hiring.is_workspace_admin()
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM hiring.process_templates
      WHERE workspace_id IN (SELECT hiring.user_workspace_ids())
        AND hiring.is_workspace_admin()
    )
  );

CREATE POLICY tenant_delete ON hiring.process_template_stages
  FOR DELETE TO authenticated
  USING (
    template_id IN (
      SELECT id FROM hiring.process_templates
      WHERE workspace_id IN (SELECT hiring.user_workspace_ids())
        AND hiring.is_workspace_admin()
    )
  );

-- GRANTs (per workspace memory: explicit on every new table).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.process_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.process_template_stages TO authenticated;
GRANT ALL ON hiring.process_templates TO service_role;
GRANT ALL ON hiring.process_template_stages TO service_role;

-- ---------- Seed default template per existing workspace ----------
-- Mirrors lib/hiring/defaults.ts DEFAULT_PIPELINE_STAGES so behaviour
-- doesn't change for the workspaces that exist today. Once this
-- migration lands, every new vacante goes through the template path.

DO $$
DECLARE
  ws record;
  tpl_id uuid;
BEGIN
  FOR ws IN SELECT id FROM hiring.workspaces LOOP
    -- Skip workspaces that already have a default (idempotent reruns).
    IF EXISTS (
      SELECT 1 FROM hiring.process_templates
      WHERE workspace_id = ws.id AND is_default = true
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO hiring.process_templates (
      workspace_id, name, description, is_default
    ) VALUES (
      ws.id, 'Default', 'Pipeline estándar de 10 etapas.', true
    ) RETURNING id INTO tpl_id;

    INSERT INTO hiring.process_template_stages
      (template_id, name, category, color, position, is_terminal, client_portal_visible)
    VALUES
      (tpl_id, 'Aplicantes',           'applied',    '#f97316', 10, false, false),
      (tpl_id, 'Pre-Aprobados',        'screening',  '#fb923c', 20, false, false),
      (tpl_id, 'Contactados',          'contacted',  '#f97316', 30, false, false),
      (tpl_id, 'Agendados',            'screening',  '#3b82f6', 40, false, false),
      (tpl_id, 'Enviados a Empresa',   'submitted',  '#3b82f6', 50, false, true),
      (tpl_id, 'Entrevistas con Empresa', 'interview', '#14b8a6', 60, false, true),
      (tpl_id, 'Oferta',               'offer',      '#22c55e', 70, false, true),
      (tpl_id, 'Referencias',          'offer',      '#16a34a', 80, false, false),
      (tpl_id, 'Contratado',           'hired',      '#16a34a', 90, true,  true),
      (tpl_id, 'Rechazados',           'rejected',   '#ef4444', 100, true, false);
  END LOOP;
END $$;
