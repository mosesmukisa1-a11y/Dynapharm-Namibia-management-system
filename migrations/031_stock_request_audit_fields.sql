-- Additive only: preserve historical actor values and timestamps.
ALTER TABLE stock_requests
 ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),
 ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255),
 ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
 ADD COLUMN IF NOT EXISTS dispatch_warehouse VARCHAR(100),
 ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(255),
 ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
