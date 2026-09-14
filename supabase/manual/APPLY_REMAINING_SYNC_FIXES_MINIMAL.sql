-- ============================================================================
-- MINIMAL remaining sync fixes (paste in Supabase SQL Editor → Run)
-- Fixes:
--   1) process_sync_operation: entity_type NOT NULL
--   2) update_sync_cursor: missing UNIQUE(device_id, school_id)
-- Full version: supabase/manual/APPLY_REMAINING_SYNC_FIXES.sql
-- ============================================================================

ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_id TEXT;

UPDATE public.sync_operations
SET entity_type = COALESCE(NULLIF(btrim(entity_type), ''), table_name, 'unknown')
WHERE entity_type IS NULL OR btrim(entity_type) = '';

UPDATE public.sync_operations
SET entity_id = COALESCE(NULLIF(btrim(entity_id), ''), record_id)
WHERE entity_id IS NULL OR btrim(entity_id) = '';

ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET DEFAULT 'unknown';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.sync_operations ALTER COLUMN entity_type DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.sync_operations ALTER COLUMN entity_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.sync_operations_fill_legacy_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_type IS NULL OR btrim(COALESCE(NEW.entity_type, '')) = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR btrim(COALESCE(NEW.entity_id, '')) = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operations_fill_legacy ON public.sync_operations;
CREATE TRIGGER trg_sync_operations_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_operations
FOR EACH ROW
EXECUTE PROCEDURE public.sync_operations_fill_legacy_columns();

ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS device_id UUID;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS school_id UUID;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS last_synced_change_id BIGINT DEFAULT 0;
ALTER TABLE public.sync_cursors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DELETE FROM public.sync_cursors a
USING public.sync_cursors b
WHERE a.ctid < b.ctid
  AND a.device_id IS NOT NULL AND a.school_id IS NOT NULL
  AND a.device_id = b.device_id AND a.school_id = b.school_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_cursors_device_school
  ON public.sync_cursors(device_id, school_id);

DROP FUNCTION IF EXISTS public.update_sync_cursor(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS public.update_sync_cursor;

CREATE OR REPLACE FUNCTION public.update_sync_cursor(
  p_school_id UUID,
  p_device_id UUID,
  p_cursor BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor BIGINT := GREATEST(0, COALESCE(p_cursor, 0));
  v_updated INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'School tenant does not exist: ' || p_school_id::text);
  END IF;

  IF p_device_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.devices WHERE id = p_device_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not registered: ' || COALESCE(p_device_id::text, 'null'));
  END IF;

  UPDATE public.sync_cursors
  SET last_synced_change_id = GREATEST(last_synced_change_id, v_cursor),
      updated_at = now()
  WHERE device_id = p_device_id AND school_id = p_school_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    BEGIN
      INSERT INTO public.sync_cursors (device_id, school_id, last_synced_change_id, updated_at)
      VALUES (p_device_id, p_school_id, v_cursor, now());
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.sync_cursors
      SET last_synced_change_id = GREATEST(last_synced_change_id, v_cursor),
          updated_at = now()
      WHERE device_id = p_device_id AND school_id = p_school_id;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'cursor', v_cursor);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.update_sync_cursor TO authenticated;
  END IF;
END $$;

-- Verify
SELECT 'entity_type nullable' AS check,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sync_operations' AND column_name='entity_type') AS result;
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='sync_cursors' AND indexname='uq_sync_cursors_device_school';
