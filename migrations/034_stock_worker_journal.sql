-- Additive worker-owned journal only. No business table mutation or seed.
CREATE TABLE IF NOT EXISTS stock_worker_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL,
  business_date DATE NOT NULL,
  scope_hash TEXT NOT NULL,
  scope_manifest JSONB,
  service_actor TEXT NOT NULL CHECK(service_actor='stock-worker'),
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','dry_run','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stock_worker_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES stock_worker_runs(id),
  kind TEXT NOT NULL CHECK(kind IN ('start','success','skip','failure','failure_alert','dry_run','cancelled')),
  attempt INTEGER NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  business_date DATE NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(run_id,kind,attempt)
);
CREATE TABLE IF NOT EXISTS stock_worker_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES stock_worker_runs(id),
  location_type TEXT NOT NULL CHECK(location_type IN ('branch','warehouse')),
  location_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK(finding_type IN ('review_variance','missing_source','missing_cache')),
  cached_quantity NUMERIC,
  known_physical_quantity NUMERIC,
  difference NUMERIC,
  evidence_basis TEXT NOT NULL DEFAULT 'exact_id_known_source_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id,location_type,location_id,product_name)
);
-- Compatible with an earlier isolated draft: retain old evidence unchanged;
-- NULL means the old row did not capture its scope, never invent a manifest.
ALTER TABLE stock_worker_runs ADD COLUMN IF NOT EXISTS scope_manifest JSONB;
CREATE INDEX IF NOT EXISTS stock_worker_runs_retry_idx ON stock_worker_runs(status,next_retry_at);
