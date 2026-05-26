-- Per-workspace dark-mode logo variant. Many brand marks are dark
-- ink on a light card and become invisible on the dark canvas. We
-- keep `logo_url` as the light variant (default) and add an optional
-- `logo_url_dark` the recruiter can upload separately. The careers
-- header picks the right one based on the active theme at render
-- time; falls back to the other variant when only one is uploaded.

ALTER TABLE hiring.workspaces
  ADD COLUMN IF NOT EXISTS logo_url_dark text;

DROP FUNCTION IF EXISTS hiring.careers_get_workspace_header(text);

CREATE OR REPLACE FUNCTION hiring.careers_get_workspace_header(
  ws_slug text
)
RETURNS TABLE (
  id uuid, name text, logo_url text, logo_url_dark text,
  accent_color text, careers_tagline text, careers_theme text
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  SELECT id, name, logo_url, logo_url_dark,
         accent_color, careers_tagline, careers_theme
  FROM hiring.workspaces WHERE slug = ws_slug LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION hiring.careers_get_workspace_header(text)
  TO anon, authenticated;
