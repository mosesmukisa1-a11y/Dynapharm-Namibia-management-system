-- Migration: MIS CSI Entries table
-- Stores customer/distributor sales entries for the CSI Entry report

CREATE TABLE IF NOT EXISTS mis_csi_entries (
    id BIGSERIAL PRIMARY KEY,
    branch_name VARCHAR(120) NOT NULL,
    nb_number VARCHAR(60),
    name VARCHAR(255),
    receipt_number VARCHAR(120),
    date DATE,
    product_code VARCHAR(120),
    product_description VARCHAR(255),
    dp NUMERIC(14, 4) DEFAULT 0,
    bv NUMERIC(14, 4) DEFAULT 0,
    qty NUMERIC(14, 4) DEFAULT 0,
    total_dp NUMERIC(14, 4) DEFAULT 0,
    total_bv NUMERIC(14, 4) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mis_csi_entries_branch
    ON mis_csi_entries (branch_name);

CREATE INDEX IF NOT EXISTS idx_mis_csi_entries_date
    ON mis_csi_entries (date);

CREATE INDEX IF NOT EXISTS idx_mis_csi_entries_nb_number
    ON mis_csi_entries (nb_number);
