-- Read paths only: no backfill or modification of historical physical quantities.
-- These evidence tables were historically initialized by the running services.
CREATE TABLE IF NOT EXISTS stock_sale_allocations (
 movement_id TEXT PRIMARY KEY REFERENCES stock_movements(id) ON DELETE CASCADE,
 sale_reference TEXT NOT NULL, branch_batch_id TEXT NOT NULL, branch_id TEXT NOT NULL,
 product_name TEXT NOT NULL, batch_no TEXT, expiry_date DATE,
 quantity NUMERIC NOT NULL CHECK(quantity>0),snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_segregated_batches (
 id TEXT PRIMARY KEY,source_type TEXT NOT NULL,source_id TEXT NOT NULL,
 location TEXT NOT NULL,condition TEXT NOT NULL,quantity NUMERIC NOT NULL CHECK(quantity>=0),
 snapshot JSONB NOT NULL,operation_id TEXT NOT NULL,line_id TEXT NOT NULL,
 purpose TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cost_stock_location_product ON stock_batches
  (LOWER(TRIM(location)),LOWER(TRIM(description)))
 WHERE remaining_quantity>0;
CREATE INDEX IF NOT EXISTS cost_stock_warehouse_product ON stock_batches
  (LOWER(TRIM(warehouse_id)),LOWER(TRIM(description)))
  WHERE remaining_quantity>0 AND (location IS NULL OR location='');
CREATE INDEX IF NOT EXISTS cost_branch_location_product ON branch_inventory_batches
 (LOWER(TRIM(branch_id)),LOWER(TRIM(product_name))) WHERE quantity>0;
CREATE INDEX IF NOT EXISTS cost_segregated_location_product ON stock_segregated_batches
 (LOWER(TRIM(location)),LOWER(TRIM(snapshot->>'product_name'))) WHERE quantity>0;
CREATE INDEX IF NOT EXISTS cost_active_transfer_source ON stock_transfers
 (LOWER(TRIM(from_warehouse)),id) WHERE status IN ('approved','dispatched','in_transit','partially_received');
CREATE INDEX IF NOT EXISTS cost_transfer_product ON stock_transfer_allocations
 (LOWER(TRIM(snapshot->>'product_name')),transfer_id,line_id,allocation_order);
CREATE INDEX IF NOT EXISTS cost_transfer_line ON stock_transfer_allocations(line_id,allocation_order);
CREATE INDEX IF NOT EXISTS cost_sale_branch_date ON stock_sale_allocations
 (LOWER(TRIM(branch_id)),created_at,movement_id);
CREATE INDEX IF NOT EXISTS cost_sale_product_date ON stock_sale_allocations
 (LOWER(TRIM(product_name)),created_at,movement_id);
CREATE INDEX IF NOT EXISTS cost_sale_date ON stock_sale_allocations(created_at,movement_id);
CREATE INDEX IF NOT EXISTS cost_legacy_sale_branch_date ON stock_movements
 (LOWER(TRIM(source_location)),created_at,id) WHERE status IN ('posted','approved');
CREATE INDEX IF NOT EXISTS cost_legacy_sale_product_date ON stock_movements
 (LOWER(TRIM(product_name)),created_at,id) WHERE status IN ('posted','approved');
CREATE INDEX IF NOT EXISTS cost_legacy_sale_date ON stock_movements(created_at,id)
 WHERE status IN ('posted','approved') AND movement_type IN ('walkin_sale','walkin_member_sale',
 'walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','prescription_dispense',
 'campaign_sale','campaign_free_item','online_order_fulfilment');
