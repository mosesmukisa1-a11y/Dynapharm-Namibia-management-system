-- Migration: Branch finance tables for cash sessions, movements, deposits, expenses, and payments

CREATE TABLE IF NOT EXISTS branch_cash_sessions (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    opening_balance NUMERIC(12, 2) DEFAULT 0,
    closing_balance NUMERIC(12, 2),
    variance NUMERIC(12, 2),
    is_open BOOLEAN DEFAULT TRUE,
    opened_by VARCHAR(100),
    opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    closed_by VARCHAR(100),
    closed_at TIMESTAMPTZ,
    metadata JSONB
);

ALTER TABLE branch_cash_sessions
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS variance NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS opened_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS closed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_branch_cash_sessions_branch
    ON branch_cash_sessions (branch_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS branch_cash_movements (
    id VARCHAR(60) PRIMARY KEY,
    session_id VARCHAR(60) REFERENCES branch_cash_sessions(id) ON DELETE CASCADE,
    branch_id VARCHAR(60) NOT NULL,
    type VARCHAR(30) NOT NULL, -- drop, expense, adjustment
    description TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reference VARCHAR(120),
    notes TEXT,
    metadata JSONB
);

ALTER TABLE branch_cash_movements
    ADD COLUMN IF NOT EXISTS session_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) NOT NULL,
    ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reference VARCHAR(120),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_branch_cash_movements_session
    ON branch_cash_movements (session_id);

CREATE INDEX IF NOT EXISTS idx_branch_cash_movements_branch
    ON branch_cash_movements (branch_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS branch_bank_deposits (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    slip_number VARCHAR(120),
    bank_name VARCHAR(120),
    bank_branch VARCHAR(120),
    account_number VARCHAR(120),
    account_type VARCHAR(50),
    deposited_by VARCHAR(120),
    notes TEXT,
    slip_file JSONB,
    status VARCHAR(30) DEFAULT 'pending', -- pending, approved, rejected
    decision_notes TEXT,
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE branch_bank_deposits
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS date DATE NOT NULL,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) NOT NULL,
    ADD COLUMN IF NOT EXISTS slip_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(120),
    ADD COLUMN IF NOT EXISTS account_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS deposited_by VARCHAR(120),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS slip_file JSONB,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS decision_notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_branch_bank_deposits_branch_status
    ON branch_bank_deposits (branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS branch_expenses (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    session_id VARCHAR(60),
    date DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    category VARCHAR(60),
    payment_method VARCHAR(30),
    status VARCHAR(30) DEFAULT 'recorded', -- recorded, approved, rejected
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    metadata JSONB
);

ALTER TABLE branch_expenses
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS session_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS date DATE NOT NULL,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) NOT NULL,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS category VARCHAR(60),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'recorded',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_branch_expenses_branch_date
    ON branch_expenses (branch_id, date DESC);

CREATE TABLE IF NOT EXISTS branch_payments (
    id VARCHAR(60) PRIMARY KEY,
    branch_id VARCHAR(60) NOT NULL,
    date DATE NOT NULL,
    client_name VARCHAR(255),
    invoice_number VARCHAR(120),
    amount NUMERIC(12, 2) NOT NULL,
    method VARCHAR(30) NOT NULL,
    reference VARCHAR(120),
    notes TEXT,
    recorded_by VARCHAR(100),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

ALTER TABLE branch_payments
    ADD COLUMN IF NOT EXISTS branch_id VARCHAR(60),
    ADD COLUMN IF NOT EXISTS date DATE NOT NULL,
    ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(120),
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) NOT NULL,
    ADD COLUMN IF NOT EXISTS method VARCHAR(30) NOT NULL,
    ADD COLUMN IF NOT EXISTS reference VARCHAR(120),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_branch_payments_branch_date
    ON branch_payments (branch_id, date DESC);

COMMENT ON TABLE branch_cash_sessions IS 'Tracks each cash drawer session per branch.';
COMMENT ON TABLE branch_cash_movements IS 'Cash movements (drops, expenses) linked to sessions.';
COMMENT ON TABLE branch_bank_deposits IS 'Bank deposit submissions per branch with approval workflow.';
COMMENT ON TABLE branch_expenses IS 'Branch expenses requiring approval and audit trail.';
COMMENT ON TABLE branch_payments IS 'Customer payments recorded at the branch front desk.';



