-- Migration: Stock management shared tables
-- Provides warehouse inventory, transfers, barcode batch logs, and structured request tracking

CREATE TABLE IF NOT EXISTS warehouse_locations (
    id VARCHAR(60) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(60) UNIQUE,
    type VARCHAR(30) DEFAULT 'warehouse',
    branch_id VARCHAR(60),
    status VARCHAR(30) DEFAULT 'active',
    timezone VARCHAR(50),
    contact JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_status
    ON warehouse_locations (status);

CREATE INDEX IF NOT EXISTS idx_warehouse_locations_branch
    ON warehouse_locations (branch_id);


-- Master list of imported barcode-enabled batches (shared across warehouse + country stock)
CREATE TABLE IF NOT EXISTS stock_batches (
    id VARCHAR(60) PRIMARY KEY,
    barcode VARCHAR(80) UNIQUE,
    carton_no VARCHAR(120),
    description VARCHAR(255),
    batch_no VARCHAR(120),
    expiry_date DATE,
    quantity NUMERIC(14, 2) DEFAULT 0,
    total_ctns NUMERIC(14, 2) DEFAULT 0,
    import_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    location VARCHAR(120),
    status VARCHAR(30) DEFAULT 'available',
    dispatched_quantity NUMERIC(14, 2) DEFAULT 0,
    remaining_quantity NUMERIC(14, 2) DEFAULT 0,
    product_id VARCHAR(120),
    warehouse_id VARCHAR(60),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_location
    ON stock_batches (location);

CREATE INDEX IF NOT EXISTS idx_stock_batches_description
    ON stock_batches (description);

CREATE INDEX IF NOT EXISTS idx_stock_batches_product
    ON stock_batches (product_id);


-- Aggregated warehouse inventory (non-branch)
CREATE TABLE IF NOT EXISTS warehouse_inventory (
    id VARCHAR(60) PRIMARY KEY,
    warehouse_id VARCHAR(60) NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
    product_id VARCHAR(120) NOT NULL,
    product_name VARCHAR(255),
    batch_no VARCHAR(120),
    expiry_date DATE,
    quantity NUMERIC(14, 2) DEFAULT 0,
    reserved_quantity NUMERIC(14, 2) DEFAULT 0,
    unit VARCHAR(50),
    reorder_level NUMERIC(14, 2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'available',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_inventory_unique_batch
    ON warehouse_inventory (warehouse_id, product_id, batch_no, expiry_date);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_status
    ON warehouse_inventory (status);


-- Detailed audit trail for warehouse inventory adjustments
CREATE TABLE IF NOT EXISTS warehouse_inventory_movements (
    id VARCHAR(60) PRIMARY KEY,
    warehouse_id VARCHAR(60) NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
    inventory_id VARCHAR(60) REFERENCES warehouse_inventory(id) ON DELETE SET NULL,
    product_id VARCHAR(120),
    product_name VARCHAR(255),
    batch_no VARCHAR(120),
    movement_type VARCHAR(40) NOT NULL,
    quantity NUMERIC(14, 2) DEFAULT 0,
    balance_after NUMERIC(14, 2),
    reference VARCHAR(120),
    notes TEXT,
    metadata JSONB,
    created_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_movements_wh
    ON warehouse_inventory_movements (warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_movements_product
    ON warehouse_inventory_movements (product_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_movements_type
    ON warehouse_inventory_movements (movement_type);


-- Structured stock transfer tracking (warehouse -> branch)
CREATE TABLE IF NOT EXISTS stock_transfers (
    id VARCHAR(60) PRIMARY KEY,
    request_id VARCHAR(255) REFERENCES stock_requests(id) ON DELETE SET NULL,
    request_number VARCHAR(255),
    from_warehouse VARCHAR(60) REFERENCES warehouse_locations(id) ON DELETE SET NULL,
    to_branch VARCHAR(120) NOT NULL,
    status VARCHAR(40) DEFAULT 'pending',
    dispatch_reference VARCHAR(120),
    dispatch_notes TEXT,
    dispatched_by VARCHAR(120),
    dispatched_at TIMESTAMPTZ,
    delivered_by VARCHAR(120),
    delivered_at TIMESTAMPTZ,
    received_by VARCHAR(120),
    received_at TIMESTAMPTZ,
    metadata JSONB,
    created_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_branch_status
    ON stock_transfers (to_branch, status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_warehouse
    ON stock_transfers (from_warehouse);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_created
    ON stock_transfers (created_at DESC);


CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id BIGSERIAL PRIMARY KEY,
    transfer_id VARCHAR(60) NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id VARCHAR(120) NOT NULL,
    product_name VARCHAR(255),
    batch_no VARCHAR(120),
    quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
    ON stock_transfer_items (transfer_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product
    ON stock_transfer_items (product_id);


-- Normalize stock request items and approvals
CREATE TABLE IF NOT EXISTS stock_request_items (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
    product_id VARCHAR(120) NOT NULL,
    product_name VARCHAR(255),
    quantity NUMERIC(14, 2) NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_request_items_request
    ON stock_request_items (request_id);

CREATE INDEX IF NOT EXISTS idx_stock_request_items_product
    ON stock_request_items (product_id);


CREATE TABLE IF NOT EXISTS stock_request_approvals (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(255) NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
    role VARCHAR(60) NOT NULL,
    approved BOOLEAN NOT NULL,
    actor VARCHAR(120),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_stock_request_approvals_request
    ON stock_request_approvals (request_id);

CREATE INDEX IF NOT EXISTS idx_stock_request_approvals_role
    ON stock_request_approvals (role);


-- Dispatch note registry for transfers
CREATE TABLE IF NOT EXISTS dispatch_notes (
    id VARCHAR(80) PRIMARY KEY,
    transfer_id VARCHAR(60) REFERENCES stock_transfers(id) ON DELETE SET NULL,
    request_id VARCHAR(255) REFERENCES stock_requests(id) ON DELETE SET NULL,
    barcode VARCHAR(80) UNIQUE,
    from_warehouse VARCHAR(60),
    to_branch VARCHAR(120),
    status VARCHAR(40) DEFAULT 'in_transit',
    expected_arrival TIMESTAMPTZ,
    dispatched_by VARCHAR(120),
    dispatched_at TIMESTAMPTZ,
    received_by VARCHAR(120),
    received_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispatch_notes_transfer
    ON dispatch_notes (transfer_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_notes_branch_status
    ON dispatch_notes (to_branch, status);


-- Event log for barcode batch movements (dispatch, receive, adjustments)
CREATE TABLE IF NOT EXISTS barcode_batch_events (
    id BIGSERIAL PRIMARY KEY,
    batch_id VARCHAR(60) NOT NULL REFERENCES stock_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    quantity NUMERIC(14, 2) DEFAULT 0,
    location VARCHAR(120),
    reference VARCHAR(120),
    notes TEXT,
    metadata JSONB,
    balance_after NUMERIC(14, 2),
    created_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_barcode_batch_events_batch
    ON barcode_batch_events (batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_barcode_batch_events_type
    ON barcode_batch_events (event_type);


-- Extend stock_requests for richer workflow support
ALTER TABLE stock_requests
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS history JSONB,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stock_requests_priority
    ON stock_requests (priority);


