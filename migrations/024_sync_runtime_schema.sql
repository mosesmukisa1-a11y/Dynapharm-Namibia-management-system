-- Migration 024: Sync runtime-added columns into migration history
-- These columns were previously added via ALTER TABLE in application startup code.
-- Declaring them here ensures the deployment schema model does not drop them.

-- distributor_agreements: approval and payment tracking columns
ALTER TABLE distributor_agreements ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE distributor_agreements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE distributor_agreements ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE distributor_agreements ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE distributor_agreements ADD COLUMN IF NOT EXISTS created_by TEXT;

-- distributors: extended profile columns (added by distributor-import and distributors API)
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'Distributor';
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS position_code TEXT;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS date_joined TEXT;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS sponsor_code TEXT;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'distributor';
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS metadata JSONB;

-- product_prices: package flag
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS is_package BOOLEAN DEFAULT FALSE;

-- stock_transfers: GM approval and dispatch tracking columns
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS prepared_by_id VARCHAR(255);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS prepared_by_role VARCHAR(100);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS destination_branch_staff JSONB;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_at TIMESTAMPTZ;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_by VARCHAR(255);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_by_id VARCHAR(255);

-- stock_movements: unit CIF cost tracking
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cif NUMERIC(14,4);

-- campaigns: campaign type, scope, conditions, prize, and discount fields
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50) DEFAULT 'custom';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'countrywide';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS prize JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_branches JSONB DEFAULT '[]';

-- branch_walkin_sales: referral tracking
ALTER TABLE branch_walkin_sales ADD COLUMN IF NOT EXISTS referral_nb VARCHAR(50);
ALTER TABLE branch_walkin_sales ADD COLUMN IF NOT EXISTS distributor_nb VARCHAR(50);

-- finance_cash_requests: updated_at timestamp
ALTER TABLE finance_cash_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Re-ensure indexes from migration 013 (idempotent)
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_imports_date ON supplier_imports (date_received DESC);
