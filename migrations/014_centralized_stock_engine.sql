-- 014: Centralized Stock Engine — inventory_balances + stock_movements normalization

-- 1. Add new columns to stock_movements
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS source_location_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS destination_location_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS unit_dp NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS movement_date TIMESTAMPTZ;

-- 2. Mark all existing records as status='posted' (NULL means posted in legacy data)
UPDATE stock_movements SET status = 'posted' WHERE status IS NULL;

-- 3. Set movement_date from created_at for existing records
UPDATE stock_movements SET movement_date = created_at WHERE movement_date IS NULL;

-- 4. Infer source_location_type from source_location
UPDATE stock_movements SET source_location_type =
  CASE
    WHEN source_location IS NULL OR source_location = '' THEN NULL
    WHEN LOWER(source_location) IN ('country_stock', 'external_supplier_source') THEN 'country'
    WHEN LOWER(source_location) LIKE '%warehouse%' THEN 'warehouse'
    WHEN LOWER(source_location) IN ('customer','patient','written_off','field') THEN NULL
    WHEN LOWER(source_location) LIKE 'in_transit%' THEN 'in_transit'
    ELSE 'branch'
  END
WHERE source_location_type IS NULL;

-- 5. Infer destination_location_type from destination_location
UPDATE stock_movements SET destination_location_type =
  CASE
    WHEN destination_location IS NULL OR destination_location = '' THEN NULL
    WHEN LOWER(destination_location) IN ('country_stock', 'external_supplier_source') THEN 'country'
    WHEN LOWER(destination_location) LIKE '%warehouse%' THEN 'warehouse'
    WHEN LOWER(destination_location) IN ('customer','patient','written_off','field') THEN NULL
    WHEN LOWER(destination_location) LIKE 'in_transit%' THEN 'in_transit'
    ELSE 'branch'
  END
WHERE destination_location_type IS NULL;

-- 6. Create inventory_balances table
CREATE TABLE IF NOT EXISTS inventory_balances (
  id VARCHAR(100) PRIMARY KEY,
  location_type VARCHAR(50) NOT NULL,
  location_id VARCHAR(200) NOT NULL,
  product_name TEXT NOT NULL,
  product_description TEXT,
  batch_no VARCHAR(100) NOT NULL DEFAULT '',
  expiry_date DATE,
  opening_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  inward_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  outward_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  closing_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_dp NUMERIC(14,4),
  unit_cif NUMERIC(14,4),
  stock_value_dp NUMERIC(14,4) DEFAULT 0,
  stock_value_cif NUMERIC(14,4) DEFAULT 0,
  last_movement_date TIMESTAMPTZ,
  source_warehouse_id VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Indexes for fast reads
CREATE INDEX IF NOT EXISTS idx_inv_bal_location
  ON inventory_balances (location_type, location_id);

CREATE INDEX IF NOT EXISTS idx_inv_bal_product
  ON inventory_balances (product_name);

CREATE INDEX IF NOT EXISTS idx_inv_bal_closing
  ON inventory_balances (location_type, location_id, closing_qty);

-- 8. Migration tracking is handled by the migration runner (run-migrations.js)
