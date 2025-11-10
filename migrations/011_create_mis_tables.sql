-- Migration: MIS portal shared tables
-- Stores encoded sales drafts, line verifications, reconciliation logs, and audit history

CREATE TABLE IF NOT EXISTS mis_sales_drafts (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    status VARCHAR(30) DEFAULT 'draft',
    line_count INTEGER DEFAULT 0,
    total_amount NUMERIC(14, 2) DEFAULT 0,
    total_quantity NUMERIC(14, 2) DEFAULT 0,
    payload JSONB,
    metadata JSONB,
    created_by VARCHAR(120),
    updated_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mis_sales_drafts_branch
    ON mis_sales_drafts (branch_id);

CREATE INDEX IF NOT EXISTS idx_mis_sales_drafts_status
    ON mis_sales_drafts (status);


CREATE TABLE IF NOT EXISTS mis_sales_lines (
    id BIGSERIAL PRIMARY KEY,
    draft_id VARCHAR(60) REFERENCES mis_sales_drafts(id) ON DELETE CASCADE,
    line_uid VARCHAR(80),
    distributor_name VARCHAR(255),
    distributor_code VARCHAR(120),
    sku VARCHAR(120),
    product_name VARCHAR(255),
    quantity NUMERIC(14, 4) DEFAULT 0,
    unit_price NUMERIC(14, 4) DEFAULT 0,
    branch_id VARCHAR(60),
    sale_timestamp TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'draft',
    validation JSONB,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mis_sales_lines_draft
    ON mis_sales_lines (draft_id);

CREATE INDEX IF NOT EXISTS idx_mis_sales_lines_branch
    ON mis_sales_lines (branch_id);

CREATE INDEX IF NOT EXISTS idx_mis_sales_lines_status
    ON mis_sales_lines (status);

CREATE INDEX IF NOT EXISTS idx_mis_sales_lines_timestamp
    ON mis_sales_lines (sale_timestamp);


CREATE TABLE IF NOT EXISTS mis_sales_audit (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL,
    record_id VARCHAR(120),
    user_name VARCHAR(120),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mis_sales_audit_record
    ON mis_sales_audit (record_id);

CREATE INDEX IF NOT EXISTS idx_mis_sales_audit_type
    ON mis_sales_audit (event_type);


CREATE TABLE IF NOT EXISTS mis_reconciliation_logs (
    id BIGSERIAL PRIMARY KEY,
    branch_id VARCHAR(60),
    period_start DATE,
    period_end DATE,
    matched_count INTEGER DEFAULT 0,
    unmatched_count INTEGER DEFAULT 0,
    discrepancies JSONB,
    summary JSONB,
    created_by VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mis_reconciliation_period
    ON mis_reconciliation_logs (period_start, period_end);


