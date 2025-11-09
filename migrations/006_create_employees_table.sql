-- Migration: ensure employees table supports HR portal requirements

-- Guarantee table exists (legacy deployments already have it)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50),
    branch VARCHAR(50),
    branches TEXT[],
    supervisor_id VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(50),
    hire_date DATE,
    employment_status VARCHAR(50) DEFAULT 'active',
    leave_entitlements JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS department VARCHAR(150),
    ADD COLUMN IF NOT EXISTS position VARCHAR(150),
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS dob DATE,
    ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS data JSONB;

-- Keep employee_id populated for legacy rows
UPDATE employees
SET employee_id = COALESCE(employee_id, user_id)
WHERE employee_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date ON employees(hire_date);

COMMENT ON COLUMN employees.data IS 'Original form payload (employment data, data collection, etc).';

