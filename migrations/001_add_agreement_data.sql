-- Migration: Add agreement_data column to distributors table
-- This allows storing all detailed distributor agreement information as JSON

-- Add agreement_data column if it doesn't exist
ALTER TABLE distributors 
ADD COLUMN IF NOT EXISTS agreement_data TEXT;

-- Add index for faster JSON queries (if using PostgreSQL with JSONB, uncomment below)
-- ALTER TABLE distributors 
-- ALTER COLUMN agreement_data TYPE JSONB USING agreement_data::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN distributors.agreement_data IS 'JSON string containing detailed distributor agreement data including birthdate, address, upline info, sponsor info, and all original CSV columns';


