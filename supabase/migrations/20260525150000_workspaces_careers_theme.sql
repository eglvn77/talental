-- Per-workspace theme override for the public careers site.
--   'light'  → public pages render with the light Distillate palette
--   'dark'   → public pages render with the dark Distillate palette
--   'system' → respect each candidate's prefers-color-scheme
--
-- Independent from the recruiter's ATS theme (which is per-user via
-- localStorage). Default 'light' because public job boards almost
-- always read better on a bright canvas — recruiters can flip it.

ALTER TABLE hiring.workspaces
  ADD COLUMN IF NOT EXISTS careers_theme text NOT NULL DEFAULT 'light'
  CHECK (careers_theme IN ('light','dark','system'));

-- Replace the careers_get_workspace_header RPC to include the new
-- column. Postgres won't let us change a function's return type via
-- CREATE OR REPLACE, so drop-then-create.
DROP FUNCTION IF EXISTS hiring.careers_get_workspace_header(text);

CREATE OR REPLACE FUNCTION hiring.careers_get_workspace_header(
  ws_slug text
)
RETURNS TABLE (
  id uuid, name text, logo_url text, accent_color text,
  careers_tagline text, careers_theme text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT id, name, logo_url, accent_color, careers_tagline, careers_theme
  FROM hiring.workspaces WHERE slug = ws_slug LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_workspace_header(text)
  TO anon, authenticated;
