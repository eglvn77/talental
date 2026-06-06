-- =====================================================
-- Resources Migration D: SOP becomes a customizable Resource.
--
-- Before: the SOP (workspace-wide playbook) lived in code
-- (lib/sop/template.ts) — hardcoded items, hardcoded phases — with
-- per-job checked-state in hiring.tasks rows marked
-- `<!-- sop:v1 | item: ITEM_ID -->`.
--
-- After: every workspace gets a seeded 'sop' resource_definition
-- (kind='checklist'). Its `template_json` column holds the items +
-- phases as data, so admins can edit them per-workspace later. Each
-- job's done-state lives in resource_values.value as
-- `{"checked": ["item-id-1","item-id-2", ...]}`.
--
-- This migration:
--   1. Extends the kind CHECK to include 'checklist'.
--   2. Adds `template_json jsonb` to resource_definitions (default {}).
--   3. Bumps existing system positions +1 so the new SOP row can land
--      at position 0 (semantically first — it's the master playbook).
--   4. Updates the workspace seed trigger to also insert the SOP
--      definition with the current template baked in.
--   5. Seeds existing workspaces (3 today) with the new row.
--   6. Backfills resource_values from hiring.tasks: every job with at
--      least one SOP-marked task gets one resource_values row whose
--      value lists the item_ids that are status='done'.
--
-- Legacy hiring.tasks rows are NOT deleted — they survive as a paper
-- trail until the app stops writing them (Phase 3b-SOP-2). The
-- mirror-back trigger from Phase 1 does NOT apply here (kind='checklist'
-- has no legacy column to mirror to).
-- =====================================================

-- 1. Extend kind enum.
ALTER TABLE hiring.resource_definitions
  DROP CONSTRAINT resource_definitions_kind_check;
ALTER TABLE hiring.resource_definitions
  ADD CONSTRAINT resource_definitions_kind_check
  CHECK (kind IN ('markdown','list','structured','sequence','checklist'));

-- 2. Add template_json. Holds workspace-customizable defaults that
--    aren't per-job content. For now only `checklist` uses it (items +
--    phases). For kind='markdown'/'list'/'structured'/'sequence' it
--    stays '{}' — those kinds derive their shape from schema_json + AI
--    generation, not from a template.
ALTER TABLE hiring.resource_definitions
  ADD COLUMN template_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Bump existing system positions so SOP lands at 0.
UPDATE hiring.resource_definitions
   SET position = position + 1
 WHERE is_system = true;

-- 4. Update the seed trigger function. Re-creates with the full set of
--    8 rows (SOP + the original 7). We keep position 0 for SOP, 1..7
--    for the original sections.
CREATE OR REPLACE FUNCTION hiring.tg_workspaces_seed_resource_definitions()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  INSERT INTO hiring.resource_definitions
    (workspace_id, key, label, kind, position, is_system, is_enabled,
     schema_json, generator_prompt, template_json)
  VALUES
    -- SOP (workspace-wide playbook, per-job done-state stored in
    -- resource_values.value.checked[]).
    (NEW.id, 'sop', 'SOP', 'checklist', 0, true, true,
     '{}'::jsonb, '',
     hiring.sop_default_template_json()),
    -- The original 7 dossier sections.
    (NEW.id, 'requirements',           'Requirements',           'structured', 1,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'sourcing',               'Sourcing',               'structured', 2,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'outreach_sequence',      'Outreach Sequence',      'sequence',   3,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'hiring_process',         'Interview Process',      'structured', 4,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'application_questions',  'Application Questions',  'structured', 5,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'ai_interview_questions', 'AI Interview',           'structured', 6,
       true, true, '{}'::jsonb, '', '{}'::jsonb),
    (NEW.id, 'talental_interview_script','Talental Interview Script','markdown', 7,
       true, true, '{}'::jsonb, '', '{}'::jsonb)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN NEW;
END;
$fn$;

-- 4b. Default SOP template, as a stable function so step 5 (seed
--     existing workspaces) and the trigger above share one source of
--     truth. Future migrations can replace this function to roll out a
--     new default; existing workspaces keep whatever they edited to.
CREATE OR REPLACE FUNCTION hiring.sop_default_template_json()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_build_object(
    'phases', jsonb_build_array(
      jsonb_build_object('key','admin',       'label_es','Admin',                    'label_en','Admin'),
      jsonb_build_object('key','kickoff',     'label_es','Kickoff',                  'label_en','Kickoff'),
      jsonb_build_object('key','calibration', 'label_es','Calibración',              'label_en','Calibration'),
      jsonb_build_object('key','sourcing',    'label_es','Sourcing & Outreach',       'label_en','Sourcing & Outreach'),
      jsonb_build_object('key','reports',     'label_es','Candidate Reports & Envío', 'label_en','Candidate Reports & Submission'),
      jsonb_build_object('key','interviews',  'label_es','Entrevistas con cliente',   'label_en','Client Interviews'),
      jsonb_build_object('key','preoffer',    'label_es','Pre-oferta',                'label_en','Pre-offer'),
      jsonb_build_object('key','offer',       'label_es','Oferta y Placement',        'label_en','Offer & Placement')
    ),
    'items', jsonb_build_array(
      -- Admin
      jsonb_build_object('id','admin-retainer',       'phase','admin','indent',0,'label_es','Calcular el retainer y registrarlo en el archivo de finanzas','label_en','Calculate retainer and log it in the finance file'),
      jsonb_build_object('id','admin-agreement-bill', 'phase','admin','indent',0,'label_es','Enviar Agreement y Down Payment Bill','label_en','Send Agreement and Down Payment Bill'),
      jsonb_build_object('id','admin-confirm-down',   'phase','admin','indent',0,'label_es','Confirmar el pago del anticipo','label_en','Confirm down-payment receipt'),
      -- Kickoff
      jsonb_build_object('id','kickoff-create-job',          'phase','kickoff','indent',0,'label_es','Crear la vacante en el ATS','label_en','Create the vacancy in the ATS'),
      jsonb_build_object('id','kickoff-review-jd',           'phase','kickoff','indent',0,'label_es','Leer y revisar el JD para que tenga sentido, no suene a IA, etc.','label_en','Read and review the JD so it makes sense and doesn''t sound AI-cheesy'),
      jsonb_build_object('id','kickoff-publish',             'phase','kickoff','indent',0,'label_es','Publicar la vacante en la página de carreras (y opcionalmente en job boards externos)','label_en','Publish the vacancy on the careers page (and optionally on external job boards)'),
      jsonb_build_object('id','kickoff-snippety-link',       'phase','kickoff','indent',0,'label_es','Agregar el link de la vacante a Snippety','label_en','Add the vacancy link to Snippety'),
      jsonb_build_object('id','kickoff-snippety-interview',  'phase','kickoff','indent',0,'label_es','Revisar el formato de entrevista y agregarlo a Snippety','label_en','Review the interview format and add it to Snippety'),
      jsonb_build_object('id','kickoff-review-outreach',     'phase','kickoff','indent',0,'label_es','Revisar el Outreach Sequence','label_en','Review the outreach sequence'),
      jsonb_build_object('id','kickoff-seed-client-candidates','phase','kickoff','indent',0,'label_es','Agregar candidatos que el cliente ya tenga activos (opcional, evita duplicados)','label_en','Add candidates the client already has active (optional, prevents duplicate outreach)'),
      jsonb_build_object('id','kickoff-send-email',          'phase','kickoff','indent',0,'label_es','Enviar el kickoff email al cliente','label_en','Send the kickoff email to the client'),
      -- Calibration
      jsonb_build_object('id','calibration-send-batch',      'phase','calibration','indent',0,'label_es','Buscar de 10 a 15 perfiles y enviarlos al cliente para feedback','label_en','Source 10–15 profiles and send them to the client for feedback'),
      jsonb_build_object('id','calibration-receive-feedback','phase','calibration','indent',0,'label_es','Recibir el feedback del cliente sobre la calibración','label_en','Receive the client''s calibration feedback'),
      -- Sourcing & Outreach
      jsonb_build_object('id','sourcing-internal-db',  'phase','sourcing','indent',1,'label_es','Sourcing en nuestra base de datos interna','label_en','Source from our internal database'),
      jsonb_build_object('id','sourcing-pin',          'phase','sourcing','indent',1,'label_es','Sourcing en PIN','label_en','Source on PIN'),
      jsonb_build_object('id','sourcing-happenstance', 'phase','sourcing','indent',1,'label_es','Sourcing en Happenstance','label_en','Source on Happenstance'),
      jsonb_build_object('id','sourcing-referrals',    'phase','sourcing','indent',1,'label_es','Pedir referrals','label_en','Ask for referrals'),
      jsonb_build_object('id','sourcing-whatsapp',     'phase','sourcing','indent',1,'label_es','WhatsApp Groups','label_en','WhatsApp groups'),
      jsonb_build_object('id','sourcing-sales-nav',    'phase','sourcing','indent',1,'label_es','LinkedIn Sales Navigator','label_en','LinkedIn Sales Navigator'),
      jsonb_build_object('id','sourcing-xray',         'phase','sourcing','indent',1,'label_es','X-Ray con Claude o Perplexity','label_en','X-Ray search with Claude or Perplexity'),
      jsonb_build_object('id','sourcing-launch-campaign','phase','sourcing','indent',0,'label_es','Lanzar la campaña de outreach a todos los candidatos','label_en','Launch the outreach campaign to all sourced candidates'),
      -- Reports
      jsonb_build_object('id','reports-create','phase','reports','indent',0,'label_es','Crear Candidate Reports (mínimo 2 candidatos muy buenos, idealmente 3)','label_en','Write Candidate Reports (minimum 2 strong candidates, ideally 3)'),
      jsonb_build_object('id','reports-send',  'phase','reports','indent',0,'label_es','Enviar candidatos al cliente (uno por uno o en batch, según prefiera)','label_en','Send candidates to the client (one-by-one or batch, per preference)'),
      -- Interviews
      jsonb_build_object('id','interviews-schedule','phase','interviews','indent',0,'label_es','Agendar entrevistas con el cliente (scheduling poll o disponibilidad directa)','label_en','Schedule client interviews (scheduling poll or direct availability)'),
      jsonb_build_object('id','interviews-run',     'phase','interviews','indent',0,'label_es','Realizar las entrevistas con el cliente','label_en','Run the client interviews'),
      jsonb_build_object('id','interviews-feedback','phase','interviews','indent',0,'label_es','Recibir feedback / debrief del cliente (SLA: 48h para responder)','label_en','Receive client feedback / debrief (SLA: 48h for the client to respond)'),
      -- Pre-offer
      jsonb_build_object('id','preoffer-comp-info','phase','preoffer','indent',0,'label_es','Pedir información de compensación completa al candidato','label_en','Request full compensation information from the candidate'),
      jsonb_build_object('id','preoffer-bg-check', 'phase','preoffer','indent',0,'label_es','Realizar background check (si la empresa cliente no lo hace por su cuenta)','label_en','Run the background check (unless the client company does it themselves)'),
      -- Offer
      jsonb_build_object('id','offer-extend',           'phase','offer','indent',0,'label_es','Pasar a la oferta y obtener aceptación','label_en','Extend the offer and secure acceptance'),
      jsonb_build_object('id','offer-placement-email', 'phase','offer','indent',0,'label_es','Enviar el placement email al cliente','label_en','Send the placement email to the client'),
      jsonb_build_object('id','offer-followup-1m',     'phase','offer','indent',0,'label_es','Follow-up al mes del placement','label_en','Follow up 1 month after placement'),
      jsonb_build_object('id','offer-followup-3m',     'phase','offer','indent',0,'label_es','Follow-up antes de los 3 meses (garantía)','label_en','Follow up before the 3-month mark (guarantee window)')
    )
  );
$fn$;

-- 5. Seed existing workspaces with the new SOP definition.
INSERT INTO hiring.resource_definitions
  (workspace_id, key, label, kind, position, is_system, is_enabled,
   schema_json, generator_prompt, template_json)
SELECT w.id, 'sop', 'SOP', 'checklist', 0, true, true,
       '{}'::jsonb, '', hiring.sop_default_template_json()
FROM hiring.workspaces w
ON CONFLICT (workspace_id, key) DO NOTHING;

-- 6. Backfill per-job done-state from hiring.tasks. Each task body
--    carries `<!-- sop:v1 | item: ITEM_ID -->`; the regex below pulls
--    ITEM_ID out and aggregates the ones with status='done' per job.
--    Jobs with no SOP tasks at all are skipped (they get a fresh empty
--    value the first time the app writes one).
WITH done_items AS (
  SELECT
    t.workspace_id,
    t.entity_id AS job_id,
    -- Item ID is the captured group between `item:` and the closing `-->`.
    (regexp_match(t.body, 'sop:v1\s*\|\s*item:\s*([a-z0-9-]+)'))[1] AS item_id,
    t.status,
    t.updated_at
  FROM hiring.tasks t
  WHERE t.entity_type = 'job'
    AND t.body LIKE '%sop:v1%'
), per_job AS (
  SELECT
    workspace_id, job_id,
    coalesce(jsonb_agg(item_id ORDER BY item_id) FILTER (WHERE status = 'done'),
             '[]'::jsonb) AS checked,
    max(updated_at) AS last_touch
  FROM done_items
  WHERE item_id IS NOT NULL
  GROUP BY workspace_id, job_id
)
INSERT INTO hiring.resource_values
  (workspace_id, job_id, definition_id, value, generated_by, generated_at)
SELECT p.workspace_id,
       p.job_id,
       rd.id,
       jsonb_build_object('checked', p.checked),
       'backfill',
       p.last_touch
FROM per_job p
JOIN hiring.resource_definitions rd
  ON rd.workspace_id = p.workspace_id AND rd.key = 'sop'
ON CONFLICT (job_id, definition_id) DO NOTHING;
