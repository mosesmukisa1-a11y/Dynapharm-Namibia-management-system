CREATE TABLE IF NOT EXISTS stock_adjustments (
  id VARCHAR(255) PRIMARY KEY,
  adj_number VARCHAR(100) UNIQUE,
  target_type VARCHAR(80),
  target_id VARCHAR(255),
  product_name VARCHAR(255),
  location VARCHAR(255),
  field_to_adjust VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  requested_by VARCHAR(120),
  requested_by_name VARCHAR(200),
  status VARCHAR(50) DEFAULT 'pending',
  gm_notes TEXT,
  approved_by VARCHAR(120),
  approved_by_name VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_status ON stock_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_target ON stock_adjustments(target_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created ON stock_adjustments(created_at);
