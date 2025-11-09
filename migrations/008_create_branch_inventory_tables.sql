-- Migration: Branch inventory batches and movements

CREATE TABLE IF NOT EXISTS branch_inventory_batches (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(100),
    batch_no VARCHAR(120),
    expiry_date DATE,
    quantity NUMERIC(14, 2) DEFAULT 0,
    unit VARCHAR(50),
    unit_price NUMERIC(12, 2),
    status VARCHAR(30) DEFAULT 'in_stock',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE branch_inventory_batches
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'in_stock',
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_branch_inventory_batches_branch
    ON branch_inventory_batches (branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_batches_product
    ON branch_inventory_batches (product_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_inventory_batches_unique_batch
    ON branch_inventory_batches (branch_id, product_name, batch_no, expiry_date);

CREATE TABLE IF NOT EXISTS branch_inventory_movements (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    type VARCHAR(30) NOT NULL,
    product_name VARCHAR(255),
    product_code VARCHAR(100),
    batch_no VARCHAR(120),
    quantity NUMERIC(14, 2) DEFAULT 0,
    unit VARCHAR(50),
    source_branch_id VARCHAR(60),
    destination_branch_id VARCHAR(60),
    related_batch_id VARCHAR(60),
    reference VARCHAR(120),
    notes TEXT,
    metadata JSONB,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE branch_inventory_movements
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120),
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS destination_branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS related_batch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS reference VARCHAR(120),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_branch_inventory_movements_branch_date
    ON branch_inventory_movements (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_movements_type
    ON branch_inventory_movements (type);

COMMENT ON TABLE branch_inventory_batches IS 'Branch-level stock batches with per-branch FEFO quantities.';
COMMENT ON TABLE branch_inventory_movements IS 'Audit trail of branch inventory movements (receive, transfer, adjustments).';

