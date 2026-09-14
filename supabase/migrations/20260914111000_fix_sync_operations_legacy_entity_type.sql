-- ============================================================================
-- Fix legacy sync_operations.entity_type NOT NULL blocking process_sync_operation
-- ============================================================================
-- Migration: 20260914111000_fix_sync_operations_legacy_entity_type.sql
-- After LWM tenant + id-column repair, INSERT into sync_operations still failed:
--   ERROR 23502: null value in column "entity_type" violates not-null constraint
-- Hosted sync_operations is a legacy shape that still requires entity_type.
-- ============================================================================

-- 1. Ensure companion Sofia columns exist
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- 2. Backfill + soften NOT NULL so RPC inserts cannot fail on legacy columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sync_operations'
      AND column_name = 'entity_type'
  ) THEN
    EXECUTE $sql$
      UPDATE public.sync_operations
      SET entity_type = COALESCE(NULLIF(entity_type, ''), table_name, 'unknown')
      WHERE entity_type IS NULL OR entity_type = ''
    $sql$;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET DEFAULT ''unknown''';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_type DROP NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sync_operations'
      AND column_name = 'entity_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.sync_operations
      SET entity_id = COALESCE(NULLIF(entity_id, ''), record_id)
      WHERE entity_id IS NULL OR entity_id = ''
    $sql$;
    BEGIN
      EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN entity_id DROP NOT NULL';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- 3. BEFORE INSERT/UPDATE trigger keeps legacy columns populated from Sofia fields
CREATE OR REPLACE FUNCTION public.sync_operations_fill_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_type IS NULL OR NEW.entity_type = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR NEW.entity_id = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  IF (NEW.table_name IS NULL OR NEW.table_name = '') AND NEW.entity_type IS NOT NULL THEN
    NEW.table_name := NEW.entity_type;
  END IF;
  IF (NEW.record_id IS NULL OR NEW.record_id = '') AND NEW.entity_id IS NOT NULL THEN
    NEW.record_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_operations_fill_legacy ON public.sync_operations;
CREATE TRIGGER trg_sync_operations_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_operations
FOR EACH ROW
EXECUTE FUNCTION public.sync_operations_fill_legacy_columns();
