-- Migration 013: Stock management enhancements
-- Adds supplier_imports table, field_stock table, CIF/DPC columns, and missing columns

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Supplier Imports table — tracks all supplier shipments entering the country
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS supplier_imports (
    id VARCHAR(60) PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    import_reference VARCHAR(255),
    grn_number VARCHAR(120),
    invoice_number VARCHAR(120),
    shipment_reference VARCHAR(120),
    product_name VARCHAR(255) NOT NULL,
    product_description TEXT,
    product_id VARCHAR(120),
    quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
    batch_no VARCHAR(120),
    expiry_date DATE,
    cif_unit_cost NUMERIC(14, 2) DEFAULT 0,
    cif_total_value NUMERIC(14, 2) DEFAULT 0,
    dpc_unit_value NUMERIC(14, 2) DEFAULT 0,
    dpc_total_value NUMERIC(14, 2) DEFAULT 0,
    date_received DATE,
    destination_warehouse VARCHAR(60),
    country VARCHAR(100) DEFAULT 'Namibia',
    origin_country VARCHAR(100) DEFAULT 'Malaysia',
    notes TEXT,
    status VARCHAR(30) DEFAULT 'received',
    created_by VARCHAR(120),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_imports_supplier ON supplier_imports (supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_imports_product ON supplier_imports (product_name);
CREATE INDEX IF NOT EXISTS idx_supplier_imports_batch ON supplier_imports (batch_no);
CREATE INDEX IF NOT EXISTS idx_supplier_imports_date ON supplier_imports (date_received DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_imports_warehouse ON supplier_imports (destination_warehouse);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Field Stock table — tracks stock issued to field teams / promoters
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS field_stock (
    id VARCHAR(60) PRIMARY KEY,
    officer_name VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    product_name VARCHAR(255) NOT NULL,
    product_id VARCHAR(120),
    batch_no VARCHAR(120),
    expiry_date DATE,
    quantity_issued NUMERIC(14, 2) DEFAULT 0,
    quantity_returned NUMERIC(14, 2) DEFAULT 0,
    quantity_sold NUMERIC(14, 2) DEFAULT 0,
    quantity_used NUMERIC(14, 2) DEFAULT 0,
    balance NUMERIC(14, 2) DEFAULT 0,
    origin_location VARCHAR(120),
    origin_type VARCHAR(30) DEFAULT 'warehouse',
    issue_date DATE,
    return_date DATE,
    status VARCHAR(30) DEFAULT 'issued',
    notes TEXT,
    created_by VARCHAR(120),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_field_stock_officer ON field_stock (officer_name);
CREATE INDEX IF NOT EXISTS idx_field_stock_product ON field_stock (product_name);
CREATE INDEX IF NOT EXISTS idx_field_stock_status ON field_stock (status);
CREATE INDEX IF NOT EXISTS idx_field_stock_origin ON field_stock (origin_location);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Add CIF/DPC columns to stock_batches
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE stock_batches
    ADD COLUMN IF NOT EXISTS cif_unit_cost NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cif_total_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dpc_unit_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dpc_total_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS import_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS supplier_import_id VARCHAR(60);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Add CIF/DPC and source columns to warehouse_inventory
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE warehouse_inventory
    ADD COLUMN IF NOT EXISTS cif_unit_cost NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dpc_unit_value NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS source_import_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS product_description TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Add extra columns to branch_inventory_batches
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE branch_inventory_batches
    ADD COLUMN IF NOT EXISTS product_description TEXT,
    ADD COLUMN IF NOT EXISTS source_warehouse VARCHAR(120),
    ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity_sold NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity_transferred NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity_adjusted NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity_returned NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_movement_date TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Add GM approval columns to stock_transfers if missing
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE stock_transfers
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Add expiry_date column to stock_transfer_items if missing
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE stock_transfer_items
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS quantity_approved NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Extend stock_movements to ensure it has all needed columns
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stock_movements (
    id VARCHAR(60) PRIMARY KEY,
    product_name VARCHAR(255),
    product_id VARCHAR(120),
    batch_no VARCHAR(120),
    expiry_date DATE,
    quantity NUMERIC(14, 2) DEFAULT 0,
    movement_type VARCHAR(40) NOT NULL,
    source_location VARCHAR(255),
    destination_location VARCHAR(255),
    reference_id VARCHAR(255),
    notes TEXT,
    created_by VARCHAR(120),
    approved_by VARCHAR(120),
    received_by VARCHAR(120),
    status VARCHAR(30) DEFAULT 'completed',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements (movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_name);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON stock_movements (source_location);
CREATE INDEX IF NOT EXISTS idx_stock_movements_dest ON stock_movements (destination_location);

-- Add columns that may be missing if table already exists
ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS product_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS approved_by VARCHAR(120),
    ADD COLUMN IF NOT EXISTS received_by VARCHAR(120),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
