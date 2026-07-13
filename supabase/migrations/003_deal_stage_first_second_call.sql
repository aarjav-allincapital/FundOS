-- Rename pipeline stages for existing databases (idempotent).
-- Fresh installs use first_call / second_call directly in 001.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'deal_stage' AND e.enumlabel = 'early_evaluation'
  ) THEN
    ALTER TYPE deal_stage RENAME VALUE 'early_evaluation' TO 'first_call';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'deal_stage' AND e.enumlabel = 'deep_dive'
  ) THEN
    ALTER TYPE deal_stage RENAME VALUE 'deep_dive' TO 'second_call';
  END IF;
END $$;
