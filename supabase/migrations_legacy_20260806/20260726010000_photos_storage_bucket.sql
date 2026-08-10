-- Public storage bucket for chat attachments, character media, and photo album uploads.
-- Server uploads use the service role (bypasses RLS); policies cover client paths.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  true,
  12582912, -- 12 MB (matches character-media JSON body ceiling)
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read (bucket is public; getPublicUrl is used app-wide).
DROP POLICY IF EXISTS photos_storage_select_public ON storage.objects;
CREATE POLICY photos_storage_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'photos');

-- Authenticated users may only write under their own folder: {user_id}/...
DROP POLICY IF EXISTS photos_storage_insert ON storage.objects;
CREATE POLICY photos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS photos_storage_update ON storage.objects;
CREATE POLICY photos_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS photos_storage_delete ON storage.objects;
CREATE POLICY photos_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
