-- ============================================================================
-- Fix legacy public.sync_changes.entity_type NOT NULL
-- ============================================================================
-- Symptom after students name fix:
--   null value in column "entity_type" of relation "sync_changes"
-- Sofia process_sync_operation inserts table_name/record_id, not entity_type.
-- ============================================================================

ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS operation TEXT;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 1;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS school_id UUID;
ALTER TABLE public.sync_changes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.sync_changes
SET entity_type = COALESCE(NULLIF(btrim(entity_type), ''), table_name, 'unknown')
WHERE entity_type IS NULL OR btrim(entity_type) = '';

UPDATE public.sync_changes
SET entity_id = COALESCE(NULLIF(btrim(entity_id), ''), record_id)
WHERE entity_id IS NULL OR btrim(entity_id) = '';

ALTER TABLE public.sync_changes ALTER COLUMN entity_type SET DEFAULT 'unknown';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.sync_changes ALTER COLUMN entity_type DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sync_changes.entity_type DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.sync_changes ALTER COLUMN entity_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sync_changes.entity_id DROP NOT NULL skipped: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.sync_changes_fill_legacy_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entity_type IS NULL OR btrim(COALESCE(NEW.entity_type, '')) = '' THEN
    NEW.entity_type := COALESCE(NEW.table_name, 'unknown');
  END IF;
  IF NEW.entity_id IS NULL OR btrim(COALESCE(NEW.entity_id, '')) = '' THEN
    NEW.entity_id := NEW.record_id;
  END IF;
  IF (NEW.table_name IS NULL OR btrim(COALESCE(NEW.table_name, '')) = '')
     AND NEW.entity_type IS NOT NULL THEN
    NEW.table_name := NEW.entity_type;
  END IF;
  IF (NEW.record_id IS NULL OR btrim(COALESCE(NEW.record_id, '')) = '')
     AND NEW.entity_id IS NOT NULL THEN
    NEW.record_id := NEW.entity_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_changes_fill_legacy ON public.sync_changes;
CREATE TRIGGER trg_sync_changes_fill_legacy
BEFORE INSERT OR UPDATE ON public.sync_changes
FOR EACH ROW
EXECUTE PROCEDURE public.sync_changes_fill_legacy_columns();

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sync_changes'
  AND column_name IN ('entity_type', 'entity_id', 'table_name', 'record_id')
ORDER BY column_name;
