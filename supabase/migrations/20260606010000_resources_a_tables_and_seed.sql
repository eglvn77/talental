-- =====================================================
-- Resources Migration A: tables + seed-on-workspace trigger.
--
-- The recruiter "Paquete" job tab today is a fixed surface with 7
-- hardcoded sub-sections (Requirements, Sourcing, Outreach Sequence,
-- Interview Process, Application Questions, AI Interview, Talental
-- Interview Script). Each writes to a dedicated hiring.jobs jsonb /
-- text column. The kickoff master prompt, the per-section Calibrate
-- button, the persist writer, and the UI tabs all encode the same
-- 7-item list — every workspace gets the same shape.
--
-- The rebuild makes this surface customisable PER WORKSPACE: every
-- workspace can add, hide, rename, or reorder sections, and AI
-- generation reads what's enabled and fills it. Talental's workspace
-- keeps the current 7 (seeded as `is_system=true`) so today's
-- behaviour is preserved.
--
-- This migration is the first of four:
--   A (this file): tables + workspace-creation trigger + seed for
--                  every existing workspace. No values yet.
--   B: backfill values for every existing job from its legacy
--      hiring.jobs.<column> jsonb.
--   C: mirror-back trigger on resource_values that writes back to
--      the legacy column during the ~30-day cutover.
--   D: drop the legacy columns + mirror trigger.
--
-- See the audit at /Users/eman/.claude/plans/wise-hugging-dijkstra.md
-- for the full plan, risks, and verification checklist.
-- =====================================================

-- 1) resource_definitions — per-workspace catalogue of sections.
CREATE TABLE IF NOT EXISTS hiring.resource_definitions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL,
  key           text        NOT NULL,
  label         text        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('markdown','list','structured','sequence')),
  schema_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generator_prompt text     NOT NULL DEFAULT '',
  position      integer     NOT NULL DEFAULT 0,
  is_system     boolean     NOT NULL DEFAULT false,
  is_enabled    boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key),
  -- Only system definitions can declare `sequence` kind — the special
  -- writer that hits hiring.sequences + hiring.sequence_steps is
  -- reserved for the seeded outreach_sequence resource. Custom
  -- resources can only be markdown / list / structured.
  CONSTRAINT resource_definitions_sequence_kind_system_only
    CHECK (kind <> 'sequence' OR is_system = true)
);

CREATE INDEX IF NOT EXISTS resource_definitions_workspace_id_position_idx
  ON hiring.resource_definitions (workspace_id, position, key);

ALTER TABLE hiring.resource_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_definitions_workspace_isolation
  ON hiring.resource_definitions;
CREATE POLICY resource_definitions_workspace_isolation
  ON hiring.resource_definitions FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.resource_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.resource_definitions TO authenticated;

-- Protect system rows: block delete + key/is_system change after
-- creation. App-layer guards are nice; DB-layer guards are decisive.
CREATE OR REPLACE FUNCTION hiring.tg_resource_definitions_protect_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'cannot delete system resource definition "%"', OLD.key;
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE path
  IF OLD.is_system THEN
    IF NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'cannot change key of system resource definition "%"', OLD.key;
    END IF;
    IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
      RAISE EXCEPTION 'cannot flip is_system on resource definition "%"', OLD.key;
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'cannot change kind of system resource definition "%"', OLD.key;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resource_definitions_protect_system
  ON hiring.resource_definitions;
CREATE TRIGGER resource_definitions_protect_system
  BEFORE UPDATE OR DELETE ON hiring.resource_definitions
  FOR EACH ROW
  EXECUTE FUNCTION hiring.tg_resource_definitions_protect_system();

-- 2) resource_values — per-job × per-definition stored content.
CREATE TABLE IF NOT EXISTS hiring.resource_values (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL,
  job_id        uuid        NOT NULL REFERENCES hiring.jobs(id) ON DELETE CASCADE,
  definition_id uuid        NOT NULL REFERENCES hiring.resource_definitions(id) ON DELETE CASCADE,
  value         jsonb       NOT NULL DEFAULT 'null'::jsonb,
  generated_by  text        NOT NULL DEFAULT 'manual'
    CHECK (generated_by IN ('manual','ai_kickoff','ai_calibrate','ai_edit','backfill')),
  generated_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, definition_id)
);

CREATE INDEX IF NOT EXISTS resource_values_job_id_idx
  ON hiring.resource_values (job_id);
CREATE INDEX IF NOT EXISTS resource_values_definition_id_idx
  ON hiring.resource_values (definition_id);

ALTER TABLE hiring.resource_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_values_workspace_isolation
  ON hiring.resource_values;
CREATE POLICY resource_values_workspace_isolation
  ON hiring.resource_values FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM hiring.team_members WHERE auth_user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.resource_values TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.resource_values TO authenticated;

-- Updated_at touch.
CREATE OR REPLACE FUNCTION hiring.tg_resource_values_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resource_values_set_updated_at
  ON hiring.resource_values;
CREATE TRIGGER resource_values_set_updated_at
  BEFORE UPDATE ON hiring.resource_values
  FOR EACH ROW
  EXECUTE FUNCTION hiring.tg_resource_values_set_updated_at();

-- 3) Seed function — insert the 7 system definitions for a workspace
--    idempotently. Called by the workspace-creation trigger + by the
--    backfill block at the bottom for every existing workspace.
--
-- generator_prompt + schema_json are concise stand-ins; they're not
-- consumed by anything until Phase 4 (master prompt templating). The
-- current static master prompt at lib/kickoff/default-master-prompt
-- continues to drive kickoff runs until that flip. Definitions exist
-- so the cutover machinery can dispatch on them and the manager UI
-- has something to render.
CREATE OR REPLACE FUNCTION hiring.seed_workspace_resource_definitions(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- (key, label, kind, position, schema_json, generator_prompt)
      ('requirements',           'Requirements',           'structured', 0,
        '{"type":"object","properties":{"must":{"type":"array","items":{"type":"string"}},"nice":{"type":"array","items":{"type":"string"}}},"required":["must","nice"]}'::jsonb,
        'Two lists: must (imprescindibles) and nice (deseables). Each item is one verifiable bullet.'),
      ('sourcing',               'Sourcing',               'structured', 1,
        '{"type":["object","null"],"properties":{"criteria":{"type":"array","items":{"type":"string"}},"questions":{"type":"array","items":{"type":"string"}},"target_companies":{"type":"array","items":{"type":"string"}}},"required":["criteria","questions","target_companies"]}'::jsonb,
        'Sourcing guidelines: hard criteria, evaluation questions, target companies.'),
      ('outreach_sequence',      'Outreach Sequence',      'sequence',   2,
        '{"type":["array","null"],"items":{"type":"object","properties":{"step":{"type":"integer"},"channel":{"type":"string"},"delay_hours":{"type":"integer"},"subject":{"type":"string"},"body":{"type":"string"}}}}'::jsonb,
        '5-step multi-channel outreach sequence. Special kind: persists to hiring.sequences + hiring.sequence_steps.'),
      ('hiring_process',         'Interview Process',      'structured', 3,
        '{"type":"array","items":{"type":"object","properties":{"order":{"type":"integer"},"who":{"type":"string"},"focus":{"type":"string"},"format":{"type":["string","null"]}}}}'::jsonb,
        'Ordered interview stages: order, who, focus, optional format.'),
      ('application_questions',  'Application Questions',  'structured', 4,
        '{"type":["array","null"],"items":{"type":"object","properties":{"question":{"type":"string"},"requirement":{"type":"string"},"type":{"type":"string"},"auto_reject_rule":{"type":["string","null"]}}}}'::jsonb,
        'Tally form questions used for screening + auto-rejection on eliminatory criteria.'),
      ('ai_interview_questions', 'AI Interview',           'structured', 5,
        '{"type":["array","null"],"items":{"type":"object","properties":{"category":{"type":"string"},"criteria":{"type":"array","items":{"type":"object"}}}}}'::jsonb,
        'AI interview categories with per-criterion rubrics (strong/weak).'),
      ('talental_interview_script','Talental Interview Script','markdown',6,
        '{"type":"string"}'::jsonb,
        'Markdown script the recruiter follows during the Talental screen.')
    ) AS t(key, label, kind, position, schema_json, generator_prompt)
  LOOP
    INSERT INTO hiring.resource_definitions
      (workspace_id, key, label, kind, schema_json, generator_prompt, position, is_system, is_enabled)
    VALUES
      (p_workspace_id, spec.key, spec.label, spec.kind, spec.schema_json,
       spec.generator_prompt, spec.position, true, true)
    ON CONFLICT (workspace_id, key) DO NOTHING;
  END LOOP;
END;
$$;

-- 4) Workspace-creation trigger: seed the 7 system definitions
--    whenever a new workspace lands.
CREATE OR REPLACE FUNCTION hiring.tg_workspaces_seed_resource_definitions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM hiring.seed_workspace_resource_definitions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_resource_definitions
  ON hiring.workspaces;
CREATE TRIGGER workspaces_seed_resource_definitions
  AFTER INSERT ON hiring.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION hiring.tg_workspaces_seed_resource_definitions();

-- 5) Backfill: every existing workspace gets the 7 system rows now.
DO $$
DECLARE
  ws record;
BEGIN
  FOR ws IN SELECT id FROM hiring.workspaces LOOP
    PERFORM hiring.seed_workspace_resource_definitions(ws.id);
  END LOOP;
END;
$$;
