-- Migration: ensure distributors table supports branch records
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distributors') THEN
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'distributor';
    ALTER TABLE distributors ALTER COLUMN entity_type SET DEFAULT 'distributor';
    UPDATE distributors SET entity_type = 'distributor' WHERE entity_type IS NULL;
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS metadata JSONB;
    CREATE INDEX IF NOT EXISTS idx_distributors_entity_type ON distributors (entity_type);
  END IF;
END
$$;

