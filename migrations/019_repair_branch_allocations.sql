-- Migration 019: Repair branch allocations for all users
-- 1. Backfill branch column from metadata->>'branch' where branch IS NULL
-- 2. Normalize all Windhoek CBD aliases (windhoek_cbd, windhoek) to canonical slug 'townshop'

BEGIN;

-- Step 1: Backfill branch from metadata where branch is NULL and metadata has a branch value
UPDATE users
SET branch = TRIM(metadata->>'branch'),
    updated_at = NOW()
WHERE branch IS NULL
  AND metadata IS NOT NULL
  AND TRIM(COALESCE(metadata->>'branch', '')) <> '';

-- Step 2: Normalize Windhoek CBD aliases in the branch column to canonical 'townshop'
UPDATE users
SET branch = 'townshop',
    updated_at = NOW()
WHERE branch IN ('windhoek_cbd', 'windhoek', 'cbd', 'cdb');

-- Step 3: Normalize Windhoek CBD aliases in metadata->>'branch' field
UPDATE users
SET metadata = jsonb_set(metadata, '{branch}', '"townshop"'),
    updated_at = NOW()
WHERE metadata IS NOT NULL
  AND metadata->>'branch' IN ('windhoek_cbd', 'windhoek', 'cbd', 'cdb');

-- Step 4: Normalize Windhoek CBD aliases in the branches JSONB array
-- Replace any windhoek_cbd/windhoek aliases within the branches array with 'townshop'
UPDATE users
SET branches = (
  SELECT jsonb_agg(
    CASE
      WHEN elem::text IN ('"windhoek_cbd"', '"windhoek"', '"cbd"', '"cdb"') THEN '"townshop"'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(branches) AS elem
),
updated_at = NOW()
WHERE branches IS NOT NULL
  AND branches != '[]'::jsonb
  AND branches::text ~ '"windhoek_cbd"|"windhoek"|"cbd"|"cdb"';

COMMIT;
