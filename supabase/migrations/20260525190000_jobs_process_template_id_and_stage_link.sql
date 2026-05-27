-- Wire jobs ↔ templates ↔ per-job stages so template edits can
-- propagate to existing vacantes.
--
-- The model:
--   jobs.process_template_id        — which template this job was
--                                     spawned from (NULL = orphan,
--                                     e.g. legacy jobs from before
--                                     this feature, or jobs explicitly
--                                     detached).
--   pipeline_stages.template_stage_id — which template_stage each
--                                       per-job stage was cloned
--                                       from. Drives surgical sync:
--                                       template stage renamed?
--                                       update every per-job stage
--                                       carrying this id. Template
--                                       stage deleted? we can find
--                                       all the copies.
--
-- Both links use ON DELETE SET NULL so deleting a template (or one
-- of its stages) doesn't cascade into deleting jobs / live pipeline
-- stages. The propagation logic in the server actions decides what
-- to do (block when applications exist, etc.).

ALTER TABLE hiring.jobs
  ADD COLUMN IF NOT EXISTS process_template_id uuid
  REFERENCES hiring.process_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_process_template_id_idx
  ON hiring.jobs (process_template_id)
  WHERE process_template_id IS NOT NULL;

ALTER TABLE hiring.pipeline_stages
  ADD COLUMN IF NOT EXISTS template_stage_id uuid
  REFERENCES hiring.process_template_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pipeline_stages_template_stage_id_idx
  ON hiring.pipeline_stages (template_stage_id)
  WHERE template_stage_id IS NOT NULL;
