-- ============================================================
-- Workspace slug rename machinery.
--
-- - workspace_slug_history archives every retired slug. We keep the
--   workspace_id pointer + retired_at so the careers route can 301
--   from `<old>/...` to `<new>/...` for as long as we want to honor
--   stale links (the app layer enforces the TTL — DB just stores
--   everything).
--
-- - workspace_slug_check_availability(candidate, current_id) is the
--   single source of truth for "can this workspace claim this slug?":
--   * 'invalid_format' — handled in app code but echoed for safety
--   * 'reserved'       — hits the hardcoded keyword list
--   * 'taken'          — another workspace owns it right now
--   * 'in_history'     — another workspace used it and we're still
--                        within the 30-day grace window
--   * 'ok'             — slug is the workspace's current one or free
--
-- - tg_workspaces_archive_slug fires AFTER UPDATE OF slug and
--   inserts the old value into history. NEW.slug uniqueness is
--   already enforced by the UNIQUE constraint on workspaces.slug.
-- ============================================================

CREATE TABLE hiring.workspace_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES hiring.workspaces(id) ON DELETE CASCADE,
  old_slug text NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workspace_slug_history_old_slug_idx
  ON hiring.workspace_slug_history (old_slug, retired_at DESC);

GRANT SELECT ON hiring.workspace_slug_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON hiring.workspace_slug_history TO service_role;
REVOKE ALL ON hiring.workspace_slug_history FROM anon;

ALTER TABLE hiring.workspace_slug_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_slug_history_select_own
  ON hiring.workspace_slug_history FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT hiring.user_workspace_ids()));

CREATE OR REPLACE FUNCTION hiring.workspace_slug_is_reserved(candidate text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(candidate) = ANY (ARRAY[
    'admin','administrator','api','app','apps','auth','login','logout',
    'signup','signin','register','reset-password','forgot-password',
    'onboarding','settings','setting','careers','jobs','job','candidate',
    'candidates','dashboard','home','www','mail','email','blog','help',
    'support','docs','documentation','status','about','contact','terms',
    'privacy','legal','public','static','assets','cdn','_next','next',
    'vercel','supabase','test','tests','dev','staging','production',
    'prod','beta','alpha','demo','example','root','system','internal',
    'talental','atese','leonar'
  ]);
$$;

CREATE OR REPLACE FUNCTION hiring.workspace_slug_check_availability(
  candidate text,
  current_workspace_id uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE AS $$
DECLARE
  taker uuid;
  hist  uuid;
BEGIN
  IF candidate IS NULL OR length(candidate) < 3 OR length(candidate) > 40
     OR candidate !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
  THEN
    RETURN 'invalid_format';
  END IF;

  IF hiring.workspace_slug_is_reserved(candidate) THEN
    RETURN 'reserved';
  END IF;

  SELECT id INTO taker FROM hiring.workspaces
   WHERE slug = candidate LIMIT 1;
  IF taker IS NOT NULL THEN
    IF taker = current_workspace_id THEN
      RETURN 'ok';
    END IF;
    RETURN 'taken';
  END IF;

  SELECT workspace_id INTO hist FROM hiring.workspace_slug_history
   WHERE old_slug = candidate
     AND retired_at > now() - interval '30 days'
   ORDER BY retired_at DESC LIMIT 1;
  IF hist IS NOT NULL AND hist <> current_workspace_id THEN
    RETURN 'in_history';
  END IF;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION hiring.workspace_slug_check_availability(text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION hiring.tg_workspaces_archive_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND OLD.slug IS NOT NULL THEN
    INSERT INTO hiring.workspace_slug_history (workspace_id, old_slug)
    VALUES (OLD.id, OLD.slug);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_archive_slug ON hiring.workspaces;
CREATE TRIGGER workspaces_archive_slug
  AFTER UPDATE OF slug ON hiring.workspaces
  FOR EACH ROW EXECUTE FUNCTION hiring.tg_workspaces_archive_slug();

CREATE OR REPLACE FUNCTION hiring.careers_resolve_historic_slug(
  old_slug text
)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE AS $$
  SELECT w.slug
  FROM hiring.workspace_slug_history h
  JOIN hiring.workspaces w ON w.id = h.workspace_id
  WHERE h.old_slug = old_slug
    AND h.retired_at > now() - interval '30 days'
    AND w.slug <> old_slug
  ORDER BY h.retired_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_resolve_historic_slug(text)
  TO anon, authenticated;
