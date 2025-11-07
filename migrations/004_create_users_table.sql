-- Migration: Create users table for authentication
-- Stores hashed credentials and role-based metadata for secure access control

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    branch VARCHAR(100),
    branches JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch);

COMMENT ON TABLE users IS 'Application users with hashed passwords and role metadata';
COMMENT ON COLUMN users.password_hash IS 'BCrypt hashed password';
COMMENT ON COLUMN users.branches IS 'JSON array of additional branch permissions';
