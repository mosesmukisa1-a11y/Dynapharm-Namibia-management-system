-- Finance Remittances Table
CREATE TABLE IF NOT EXISTS finance_remittances (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reference VARCHAR(120),
  payment_date DATE,
  notes TEXT,
  status VARCHAR(40) DEFAULT 'completed',
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HR Leave Requests Table
CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(80),
  employee_name VARCHAR(200) NOT NULL,
  leave_type VARCHAR(60) DEFAULT 'Annual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(40) DEFAULT 'pending',
  approved_by VARCHAR(120),
  approved_at TIMESTAMPTZ,
  created_by VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HR Records Table (warnings, terminations, attendance, performance)
CREATE TABLE IF NOT EXISTS hr_records (
  id SERIAL PRIMARY KEY,
  type VARCHAR(60) NOT NULL,
  employee_name VARCHAR(200) NOT NULL,
  employee_id VARCHAR(80),
  subtype VARCHAR(80),
  notes TEXT,
  reason TEXT,
  effective_date DATE,
  date DATE,
  clock_in VARCHAR(20),
  clock_out VARCHAR(20),
  rating INTEGER,
  strengths TEXT,
  improvements TEXT,
  goals TEXT,
  severance NUMERIC(14, 2),
  status VARCHAR(40) DEFAULT 'active',
  created_by VARCHAR(120),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_records_type ON hr_records(type);
CREATE INDEX IF NOT EXISTS idx_hr_records_employee ON hr_records(employee_name);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_employee ON hr_leave_requests(employee_name);
