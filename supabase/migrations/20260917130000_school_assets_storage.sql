-- ============================================================================
-- Step 9: Storage bucket for multi-desk branding & student photo bytes
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-assets',
  'school-assets',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Desktop clients use the anon key with SECURITY DEFINER RPCs for row sync.
-- Asset objects are keyed as {school_id}/{table}/{record_id}/{field}.{ext}.
DROP POLICY IF EXISTS school_assets_select ON storage.objects;
DROP POLICY IF EXISTS school_assets_insert ON storage.objects;
DROP POLICY IF EXISTS school_assets_update ON storage.objects;
DROP POLICY IF EXISTS school_assets_delete ON storage.objects;

CREATE POLICY school_assets_select
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'school-assets');

CREATE POLICY school_assets_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'school-assets');

CREATE POLICY school_assets_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'school-assets')
  WITH CHECK (bucket_id = 'school-assets');

CREATE POLICY school_assets_delete
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'school-assets');
