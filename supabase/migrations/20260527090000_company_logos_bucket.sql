-- Public storage bucket for workspace-managed company logos. Mirrors
-- the `avatars` bucket pattern: public reads (we surface logos across
-- the app), writes restricted to authenticated users.
--
-- Per-row ownership is enforced server-side by the upload action
-- (admin gate + workspace match), not by storage RLS. Storage RLS
-- here only filters by bucket + authenticated session — the action
-- guarantees the file path matches a company the caller can edit.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,  -- 2 MB cap; logos are small
  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "company_logos_read_all"   ON storage.objects;
DROP POLICY IF EXISTS "company_logos_insert_any" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_update_any" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_delete_any" ON storage.objects;

CREATE POLICY "company_logos_read_all" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-logos');

-- Server-side action enforces admin + workspace ownership; storage
-- only checks the user is authenticated.
CREATE POLICY "company_logos_insert_any" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "company_logos_update_any" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY "company_logos_delete_any" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos');
