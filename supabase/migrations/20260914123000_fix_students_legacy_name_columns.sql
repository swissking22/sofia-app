-- ============================================================================
-- Fix legacy public.students.first_name / last_name blocking process_sync_operation
-- ============================================================================
-- Migration: 20260914123000_fix_students_legacy_name_columns.sql
-- Hosted students table still has NOT NULL first_name/last_name from a pre-Sofia
-- schema, while Sofia sync writes a single `name` column.
-- ============================================================================

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill name from legacy parts when needed
UPDATE public.students
SET name = NULLIF(btrim(CONCAT_WS(' ', first_name, last_name)), '')
WHERE (name IS NULL OR btrim(name) = '')
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Backfill legacy parts from name when needed
UPDATE public.students
SET
  first_name = COALESCE(
    NULLIF(btrim(first_name), ''),
    NULLIF(split_part(btrim(name), ' ', 1), ''),
    'Unknown'
  ),
  last_name = COALESCE(
    NULLIF(btrim(last_name), ''),
    NULLIF(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), ''),
    ''
  )
WHERE name IS NOT NULL AND btrim(name) <> '';

ALTER TABLE public.students ALTER COLUMN first_name SET DEFAULT 'Unknown';
ALTER TABLE public.students ALTER COLUMN last_name SET DEFAULT '';

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.students ALTER COLUMN first_name DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'first_name DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.students ALTER COLUMN last_name DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'last_name DROP NOT NULL skipped: %', SQLERRM;
  END;
  BEGIN
    -- Ensure Sofia `name` is usable
    UPDATE public.students SET name = COALESCE(NULLIF(btrim(name), ''), 'Unknown') WHERE name IS NULL OR btrim(name) = '';
    ALTER TABLE public.students ALTER COLUMN name SET DEFAULT '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'name default skipped: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.students_fill_legacy_name_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_full TEXT;
  v_first TEXT;
  v_rest TEXT;
BEGIN
  v_full := NULLIF(btrim(COALESCE(NEW.name, '')), '');

  IF v_full IS NULL THEN
    v_full := NULLIF(btrim(CONCAT_WS(' ', NEW.first_name, NEW.last_name)), '');
    IF v_full IS NOT NULL THEN
      NEW.name := v_full;
    ELSE
      NEW.name := 'Unknown';
      v_full := 'Unknown';
    END IF;
  END IF;

  IF NEW.first_name IS NULL OR btrim(NEW.first_name) = '' THEN
    v_first := split_part(v_full, ' ', 1);
    v_rest := NULLIF(btrim(substr(v_full, length(v_first) + 1)), '');
    NEW.first_name := COALESCE(NULLIF(v_first, ''), 'Unknown');
    IF NEW.last_name IS NULL OR btrim(NEW.last_name) = '' THEN
      NEW.last_name := COALESCE(v_rest, '');
    END IF;
  ELSIF NEW.last_name IS NULL THEN
    NEW.last_name := '';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_fill_legacy_name ON public.students;
CREATE TRIGGER trg_students_fill_legacy_name
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW
EXECUTE PROCEDURE public.students_fill_legacy_name_columns();

-- Smoke checks
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'students'
  AND column_name IN ('name', 'first_name', 'last_name')
ORDER BY column_name;
