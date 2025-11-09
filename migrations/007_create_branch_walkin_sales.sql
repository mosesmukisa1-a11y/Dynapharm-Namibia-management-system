-- Migration: ensure branch walk-in sales table and indexes exist

CREATE TABLE IF NOT EXISTS branch_walkin_sales (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    sale_number VARCHAR(60),
    sale_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(100),
    customer_email VARCHAR(255),
    customer_type VARCHAR(50),
    payment_method VARCHAR(50),
    subtotal NUMERIC(12, 2),
    discount NUMERIC(12, 2),
    tax NUMERIC(12, 2),
    total NUMERIC(12, 2),
    total_bv NUMERIC(12, 2),
    status VARCHAR(30) DEFAULT 'completed',
    items JSONB,
    data JSONB,
    metadata JSONB,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE branch_walkin_sales
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS sale_number VARCHAR(60),
    ADD COLUMN IF NOT EXISTS sale_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS discount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS tax NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total_bv NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS items JSONB,
    ADD COLUMN IF NOT EXISTS data JSONB,
    ADD COLUMN IF NOT EXISTS metadata JSONB,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_branch_walkin_sales_branch_date
    ON branch_walkin_sales (branch_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_branch_walkin_sales_customer
    ON branch_walkin_sales (customer_name);

CREATE INDEX IF NOT EXISTS idx_branch_walkin_sales_status
    ON branch_walkin_sales (status);

COMMENT ON TABLE branch_walkin_sales IS 'Walk-in sales recorded per branch, details stored in JSON columns.';
COMMENT ON COLUMN branch_walkin_sales.items IS 'Array of line items sold in this transaction.';
COMMENT ON COLUMN branch_walkin_sales.data IS 'Canonical sale payload as received from the portal.';

