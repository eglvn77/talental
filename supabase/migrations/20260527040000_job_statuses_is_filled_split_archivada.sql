-- Split the merged "Archivada" terminal state into two distinguishable
-- outcomes (Cubierta = filled = success, Cancelada = closed without a
-- placement). Future reports rely on the semantic difference:
-- placement velocity, fill rate, etc. need to know which terminal
-- vacantes ended in success.
--
-- Mechanism: new `is_filled` flag. The constraint enforces that
-- is_filled can only be true when the row is also is_archived (a
-- vacante can't be filled while still open). The existing
-- open_archived_mutex CHECK is unchanged.

ALTER TABLE hiring.job_statuses
  ADD COLUMN IF NOT EXISTS is_filled boolean NOT NULL DEFAULT false;

ALTER TABLE hiring.job_statuses
  ADD CONSTRAINT job_statuses_filled_requires_archived
  CHECK (NOT is_filled OR is_archived);

UPDATE hiring.job_statuses
SET key = 'cubierta',
    label = 'Cubierta',
    color = '#22c55e',
    is_filled = true
WHERE key = 'archivada';

INSERT INTO hiring.job_statuses
  (workspace_id, key, label, color, position, is_archived, is_open, is_filled, is_system)
SELECT id, 'cancelada', 'Cancelada', '#8E3829', 30, true, false, false, true
FROM hiring.workspaces
ON CONFLICT (workspace_id, key) DO NOTHING;

CREATE OR REPLACE FUNCTION hiring.tg_seed_job_statuses()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hiring.job_statuses
    (workspace_id, key, label, color, position, is_archived, is_open, is_filled, is_system)
  VALUES
    (NEW.id, 'borrador',  'Borrador',  '#94a3b8',  0, false, false, false, true),
    (NEW.id, 'activa',    'Activa',    '#8e966a', 10, false, true,  false, true),
    (NEW.id, 'cubierta',  'Cubierta',  '#22c55e', 20, true,  false, true,  true),
    (NEW.id, 'cancelada', 'Cancelada', '#8E3829', 30, true,  false, false, true);
  RETURN NEW;
END;
$$;
