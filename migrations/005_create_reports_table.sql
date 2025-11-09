-- Migration: Create reports table for consultant/dispenser records

CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(255) PRIMARY KEY,
    client_id VARCHAR(255),
    consultant VARCHAR(255),
    branch VARCHAR(100),
    report_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB
);

CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_consultant ON reports(consultant);
CREATE INDEX IF NOT EXISTS idx_reports_branch ON reports(branch);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

COMMENT ON TABLE reports IS 'Stores consultant/dispenser reports with full payload in JSONB.';
COMMENT ON COLUMN reports.data IS 'Original report payload for detailed fields.';

