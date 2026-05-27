-- One row per behavior per workspace. Reports key on the four
-- canonical lifecycle categories (draft / open / closed_won /
-- closed_lost), so allowing multiple rows with the same flag triple
-- would split the fill-rate / time-to-fill counts in confusing
-- ways. UNIQUE here means no matter what the API does, the DB
-- guarantees exactly one row per behavior.
--
-- The flag triples that this constraint admits (combined with the
-- existing open_archived_mutex + filled_requires_archived CHECKs):
--   (false, false, false) — Borrador
--   (true,  false, false) — Búsqueda activa
--   (false, true,  true)  — Cerrada con éxito
--   (false, true,  false) — Cerrada sin éxito
ALTER TABLE hiring.job_statuses
  ADD CONSTRAINT job_statuses_one_per_behavior_per_workspace
  UNIQUE (workspace_id, is_open, is_archived, is_filled);
