-- Additive only. No historical repair is run at startup or migration.
ALTER TABLE mis_sales_audit ADD COLUMN IF NOT EXISTS source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS mis_sales_audit_source_key ON mis_sales_audit(source_key);
CREATE TABLE IF NOT EXISTS sale_completion_retries(
  request_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response JSONB NOT NULL,
  response_status INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
-- A fractional stock issue must not fail or round when mirrored into activity.
ALTER TABLE branch_activity_transactions ALTER COLUMN total_qty TYPE NUMERIC;
