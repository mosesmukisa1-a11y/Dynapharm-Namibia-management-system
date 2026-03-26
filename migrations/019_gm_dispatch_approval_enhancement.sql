-- 019: GM Dispatch Approval Enhancement
-- Adds columns to stock_transfers to capture:
--   - prepared_by_id: ID of the authenticated user who prepared the dispatch
--   - prepared_by_role: role of the preparing user at time of dispatch
--   - destination_branch_staff: JSONB snapshot of staff at destination branch at dispatch creation
--   - gm_approved_at: timestamp when GM formally approved the dispatch
--   - gm_approved_by: name of the GM who approved the dispatch

ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS prepared_by_id    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS prepared_by_role  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS destination_branch_staff JSONB,
  ADD COLUMN IF NOT EXISTS gm_approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gm_approved_by    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gm_approved_by_id VARCHAR(255);

COMMENT ON COLUMN stock_transfers.prepared_by_id     IS 'User ID of the staff member who prepared this dispatch';
COMMENT ON COLUMN stock_transfers.prepared_by_role   IS 'Role of the preparing staff member at dispatch creation time';
COMMENT ON COLUMN stock_transfers.destination_branch_staff IS 'JSONB snapshot of all active staff assigned to the destination branch at time of dispatch';
COMMENT ON COLUMN stock_transfers.gm_approved_at     IS 'Timestamp when a General Manager formally approved this dispatch';
COMMENT ON COLUMN stock_transfers.gm_approved_by     IS 'Full name of the General Manager who approved this dispatch';
COMMENT ON COLUMN stock_transfers.gm_approved_by_id  IS 'User ID of the General Manager who approved this dispatch';
