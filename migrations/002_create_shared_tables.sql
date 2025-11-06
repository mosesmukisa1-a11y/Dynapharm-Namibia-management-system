-- Migration: Create tables for shared data across all users
-- These tables enable real-time data availability for all users

-- Clients table (if not exists)
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(255) PRIMARY KEY,
    reference_number VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    gender VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    city VARCHAR(100),
    branch VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB -- Store all additional client data as JSON
);

CREATE INDEX IF NOT EXISTS idx_clients_reference ON clients(reference_number);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_branch ON clients(branch);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(255) PRIMARY KEY,
    client_reference VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    date DATE NOT NULL,
    time TIME NOT NULL,
    branch VARCHAR(100),
    type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB -- Store full appointment form data
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON appointments(branch);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Stock Requests table
CREATE TABLE IF NOT EXISTS stock_requests (
    id VARCHAR(255) PRIMARY KEY,
    request_number VARCHAR(255) UNIQUE,
    requesting_branch VARCHAR(100) NOT NULL,
    request_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    items JSONB NOT NULL, -- Array of requested items
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    data JSONB -- Additional request data
);

CREATE INDEX IF NOT EXISTS idx_stock_requests_branch ON stock_requests(requesting_branch);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_date ON stock_requests(created_at);

-- Visits table
CREATE TABLE IF NOT EXISTS visits (
    id VARCHAR(255) PRIMARY KEY,
    client_reference VARCHAR(255),
    distributor_code VARCHAR(100),
    visit_date DATE NOT NULL,
    branch VARCHAR(100),
    visit_type VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB -- Full visit data
);

CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON visits(branch);
CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_reference);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'active',
    branch VARCHAR(100),
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB -- Campaign details
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

-- Finance Cash Requests table
CREATE TABLE IF NOT EXISTS finance_cash_requests (
    id VARCHAR(255) PRIMARY KEY,
    request_number VARCHAR(255) UNIQUE,
    branch VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    purpose TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    requested_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    data JSONB
);

CREATE INDEX IF NOT EXISTS idx_finance_requests_branch ON finance_cash_requests(branch);
CREATE INDEX IF NOT EXISTS idx_finance_requests_status ON finance_cash_requests(status);

-- Leave Requests table
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(255) PRIMARY KEY,
    employee_id VARCHAR(255) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    leave_type VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_requested INTEGER,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    branch VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    data JSONB
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

