-- Additive evidence only. No historical physical quantities or costs are updated.
CREATE TABLE IF NOT EXISTS stock_product_packs (
 product_name TEXT PRIMARY KEY, base_unit TEXT NOT NULL, packs JSONB NOT NULL DEFAULT '[]',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_import_receipts (
 receipt_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_transfer_allocations (
 id TEXT PRIMARY KEY, allocation_order BIGSERIAL,
 transfer_id TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
 line_id BIGINT NOT NULL REFERENCES stock_transfer_items(id) ON DELETE CASCADE,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL,
 quantity NUMERIC NOT NULL CHECK(quantity>0), snapshot JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_transfer_allocations_transfer ON stock_transfer_allocations(transfer_id,line_id);
-- Retain exact converted costs without changing historical two-decimal values.
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE supplier_imports ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE supplier_imports ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS original_unit_cif NUMERIC;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS original_unit_dp NUMERIC;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS on_hand_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS available_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS quarantined_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS expired_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS in_transit_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS missing_cost_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS missing_dp_qty NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 0;
