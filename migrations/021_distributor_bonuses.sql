-- Migration 021: Distributor Bonus Workflow tables
CREATE TABLE IF NOT EXISTS distributor_bonuses (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  distributor_id TEXT,
  nb_number TEXT NOT NULL,
  distributor_name TEXT NOT NULL,
  amount_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_by_branch_id TEXT,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_bonuses_nb ON distributor_bonuses (nb_number);
CREATE INDEX IF NOT EXISTS idx_dist_bonuses_period ON distributor_bonuses (period);
CREATE INDEX IF NOT EXISTS idx_dist_bonuses_status ON distributor_bonuses (status);

CREATE TABLE IF NOT EXISTS distributor_bonus_payments (
  id TEXT PRIMARY KEY,
  bonus_id TEXT NOT NULL REFERENCES distributor_bonuses(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  paid_at DATE NOT NULL,
  recorded_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_bonus_payments_bonus_id ON distributor_bonus_payments (bonus_id);
CREATE INDEX IF NOT EXISTS idx_dist_bonus_payments_branch ON distributor_bonus_payments (branch_id);
