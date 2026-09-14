-- ============================================================================
-- Fix sync_operations_status_check blocking process_sync_operation
-- ============================================================================
-- Symptom:
--   new row for relation "sync_operations" violates check constraint
--   "sync_operations_status_check"
-- Sofia RPC uses status values: pending | applied | failed
-- ============================================================================

ALTER TABLE public.sync_operations DROP CONSTRAINT IF EXISTS sync_operations_status_check;

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any other CHECK constraints on status that conflict
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.sync_operations'::regclass
      AND c.contype = 'c'
      AND a.attname = 'status'
      AND a.attnum > 0
  LOOP
    EXECUTE format('ALTER TABLE public.sync_operations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.sync_operations
  ADD CONSTRAINT sync_operations_status_check
  CHECK (status IS NULL OR status IN ('pending', 'applied', 'failed', 'processing', 'completed', 'error'));

-- Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.sync_operations'::regclass
  AND contype = 'c'
  AND conname ILIKE '%status%';
