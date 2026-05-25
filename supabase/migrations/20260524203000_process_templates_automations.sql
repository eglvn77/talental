-- Per-template automation flags. When a vacante runs on this
-- template, the candidate is auto-moved to the first stage with the
-- corresponding category on:
--   * outbound message sent  -> first 'contacted' stage
--   * inbound reply received  -> first 'answered'  stage
-- Wiring lives in the outreach + inbox handlers (follow-up). For now
-- the columns just hold the admin's preference so the UI can toggle
-- them per-template ahead of the engine work.

ALTER TABLE hiring.process_templates
  ADD COLUMN IF NOT EXISTS auto_move_contacted_on_outbound boolean
    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_move_answered_on_reply boolean
    NOT NULL DEFAULT false;
