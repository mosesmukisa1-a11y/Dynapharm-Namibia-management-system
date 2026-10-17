// Fixed isolated fixture statements. NEVER imported by production modules.
export default {
  "owned-tests/tests/sql-security-families.spec.js:105:0": {
    "chunks": [
      "SELECT 1/0"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/sql-security-families.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/sale-evidence.spec.js:519:1": {
    "chunks": [
      "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/sale-evidence.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "control"
  },
  "owned-tests/tests/sale-evidence.spec.js:520:2": {
    "chunks": [
      "SET TRANSACTION READ ONLY"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/sale-evidence.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "control"
  },
  "owned-tests/tests/branch-stock-clearance.spec.js:237:3": {
    "chunks": [
      "LOCK TABLE branch_inventory_batches IN EXCLUSIVE MODE"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/branch-stock-clearance.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:12:4": {
    "chunks": [
      "CREATE TEMP TABLE stock_requests (\n    id VARCHAR(255) PRIMARY KEY,\n    request_number VARCHAR(255) UNIQUE,\n    requesting_branch VARCHAR(100) NOT NULL,\n    request_type VARCHAR(50),\n    status VARCHAR(50) DEFAULT 'pending',\n    items JSONB NOT NULL, -- Array of requested items\n    notes TEXT,\n    created_by VARCHAR(255),\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n    approved_by VARCHAR(255),\n    approved_at TIMESTAMP,\n    data JSONB -- Additional request data\n);"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/stock-request-migration.spec.js:13:5": {
    "chunks": [
      "ALTER TABLE stock_requests ADD COLUMN last_status_change timestamptz"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/stock-request-migration.spec.js:14:6": {
    "chunks": [
      "INSERT INTO stock_requests(id,requesting_branch,status,items) VALUES('historical','townshop','pending','[]')"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:15:7": {
    "chunks": [
      "SAVEPOINT before_migration"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:16:8": {
    "chunks": [
      "-- Additive only: preserve historical actor values and timestamps.\nALTER TABLE stock_requests\n ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ,\n ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,\n ADD COLUMN IF NOT EXISTS rejection_reason TEXT,\n ADD COLUMN IF NOT EXISTS dispatch_warehouse VARCHAR(100),\n ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;\n"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:16:9": {
    "chunks": [
      "-- Additive only: preserve historical actor values and timestamps.\nALTER TABLE stock_requests\n ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMPTZ,\n ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,\n ADD COLUMN IF NOT EXISTS rejection_reason TEXT,\n ADD COLUMN IF NOT EXISTS dispatch_warehouse VARCHAR(100),\n ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(255),\n ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;\n"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:17:10": {
    "chunks": [
      "UPDATE stock_requests SET updated_by='session-actor',last_status_change=NOW(),rejected_by='session-actor',rejected_at=NOW(),status='rejected' WHERE id='historical'"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/stock-request-migration.spec.js:18:11": {
    "chunks": [
      "SELECT updated_by FROM stock_requests"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/stock-request-migration.spec.js:19:12": {
    "chunks": [
      "ROLLBACK TO SAVEPOINT before_migration"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "control"
  },
  "owned-tests/tests/stock-request-migration.spec.js:20:13": {
    "chunks": [
      "SELECT status FROM stock_requests"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/stock-request-migration.spec.js:21:14": {
    "chunks": [
      "DROP TABLE pg_temp.stock_requests"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-request-migration.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/branch-writeoff-review.spec.js:74:15": {
    "chunks": [
      "SELECT pg_backend_pid() AS pid"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/branch-writeoff-review.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/stock-remaining-verification.spec.js:146:16": {
    "chunks": [
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-remaining-verification.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "control"
  },
  "owned-tests/tests/stock-safety-atomic.spec.js:77:17": {
    "chunks": [
      "SELECT pg_backend_pid() AS pid"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-safety-atomic.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/stock-safety-atomic.spec.js:79:18": {
    "chunks": [
      "SELECT pg_backend_pid() AS pid"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-safety-atomic.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/stock-safety-atomic.spec.js:80:19": {
    "chunks": [
      "SELECT pg_backend_pid() AS pid"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/stock-safety-atomic.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/price-list-import.spec.js:105:20": {
    "chunks": [
      "SELECT 1/0"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/price-list-import.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/price-list-import.spec.js:131:21": {
    "chunks": [
      "SELECT dp FROM live_product_prices WHERE id=$1"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/price-list-import.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/price-list-import.spec.js:132:22": {
    "chunks": [
      "SELECT id FROM live_product_prices WHERE description=$1"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/price-list-import.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/manual-price-control.spec.js:44:23": {
    "chunks": [
      "CREATE SCHEMA manual_price_fresh"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/manual-price-control.spec.js:45:24": {
    "chunks": [
      "SET LOCAL search_path TO manual_price_fresh"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "control"
  },
  "owned-tests/tests/manual-price-control.spec.js:46:25": {
    "chunks": [
      "CREATE TABLE IF NOT EXISTS product_prices (\n  id SERIAL PRIMARY KEY,description VARCHAR(255) NOT NULL UNIQUE,\n  dp NUMERIC(10,2) DEFAULT 0,cp NUMERIC(10,2) DEFAULT 0,cif NUMERIC(10,2) DEFAULT 0,\n  bv NUMERIC(10,2) DEFAULT 0,is_package BOOLEAN DEFAULT FALSE,\n  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_by VARCHAR(255)\n);\nCREATE TABLE IF NOT EXISTS product_price_history (\n  id SERIAL PRIMARY KEY,product_id INTEGER REFERENCES product_prices(id),\n  description VARCHAR(255),old_dp NUMERIC(10,2),old_cp NUMERIC(10,2),\n  old_cif NUMERIC(10,2),old_bv NUMERIC(10,2),new_dp NUMERIC(10,2),\n  new_cp NUMERIC(10,2),new_cif NUMERIC(10,2),new_bv NUMERIC(10,2),\n  changed_by VARCHAR(255),changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS product_code VARCHAR(30);\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS original_cif NUMERIC(10,2);\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS vat_pct NUMERIC(5,2) DEFAULT 15;\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS import_duty_pct NUMERIC(5,2) DEFAULT 0;\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS clearing_fee NUMERIC(10,2) DEFAULT 1;\nALTER TABLE product_prices ADD COLUMN IF NOT EXISTS merged_into_id INTEGER REFERENCES product_prices(id);\nALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE;\nALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied';\nALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS original_product_id INTEGER;\nCREATE TABLE IF NOT EXISTS price_import_additions (\n id SERIAL PRIMARY KEY, description TEXT NOT NULL, product_code TEXT, dp NUMERIC(10,2) NOT NULL,\n cp NUMERIC(10,2) NOT NULL, cif NUMERIC(10,2) NOT NULL DEFAULT 0, bv NUMERIC(10,2) NOT NULL DEFAULT 0,\n effective_from DATE NOT NULL, changed_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',\n created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), product_id INTEGER REFERENCES product_prices(id)\n);\nCREATE TABLE IF NOT EXISTS price_reconciliation_backups (\n id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by TEXT NOT NULL,\n canonical_id INTEGER NOT NULL, snapshot JSONB NOT NULL\n);\nALTER TABLE price_import_additions ADD COLUMN IF NOT EXISTS activation_error TEXT;\n-- Name lookups retain archived descriptions but always return current canonical\n-- prices and IDs. Catalogue lists select catalogue_entry so aliases never become\n-- duplicate products. Equivalent case/spacing aliases appear once per identity.\nCREATE OR REPLACE VIEW live_product_prices AS\nSELECT DISTINCT ON (LOWER(REGEXP_REPLACE(TRIM(names.description), '\\s+', ' ', 'g')), canonical.id)\n  (jsonb_populate_record(NULL::product_prices,\n    to_jsonb(canonical) || jsonb_build_object('description',names.description))).*,\n  ARRAY(SELECT old.description FROM product_prices old\n    WHERE old.merged_into_id=canonical.id ORDER BY old.id) AS aliases,\n  names.catalogue_entry\nFROM product_prices alias\nJOIN product_prices canonical ON canonical.id=COALESCE(alias.merged_into_id,alias.id)\nCROSS JOIN LATERAL (\n  SELECT alias.description,alias.id=canonical.id AS catalogue_entry\n  UNION ALL\n  SELECT REGEXP_REPLACE(canonical.description,'^[A-Za-z]{1,3}[0-9]{4,6}[A-Za-z]?\\s+',''),FALSE\n  WHERE alias.id=canonical.id\n    AND canonical.description ~ '^[A-Za-z]{1,3}[0-9]{4,6}[A-Za-z]?\\s+'\n    AND UPPER(SPLIT_PART(canonical.description,' ',1))=UPPER(canonical.product_code)\n) names\nWHERE canonical.merged_into_id IS NULL\nORDER BY LOWER(REGEXP_REPLACE(TRIM(names.description), '\\s+', ' ', 'g')),\n  canonical.id,names.catalogue_entry DESC,alias.id;\n"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/manual-price-control.spec.js:48:26": {
    "chunks": [
      "-- Explicit additive operator migration. Never applied by web startup or a GET.\nCREATE TABLE IF NOT EXISTS manual_price_actions (\n  id BIGSERIAL PRIMARY KEY,\n  history_id INTEGER NOT NULL UNIQUE REFERENCES product_price_history(id),\n  action TEXT NOT NULL CHECK (action IN ('activation','compensation')),\n  reverses_history_id INTEGER UNIQUE REFERENCES product_price_history(id),\n  scope TEXT NOT NULL CHECK (scope = 'global'),\n  actor_id TEXT NOT NULL,\n  actor_name TEXT NOT NULL,\n  approval_reference TEXT NOT NULL,\n  before_prices JSONB NOT NULL,\n  after_prices JSONB NOT NULL,\n  live_version TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/manual-price-control.spec.js:48:27": {
    "chunks": [
      "-- Explicit additive operator migration. Never applied by web startup or a GET.\nCREATE TABLE IF NOT EXISTS manual_price_actions (\n  id BIGSERIAL PRIMARY KEY,\n  history_id INTEGER NOT NULL UNIQUE REFERENCES product_price_history(id),\n  action TEXT NOT NULL CHECK (action IN ('activation','compensation')),\n  reverses_history_id INTEGER UNIQUE REFERENCES product_price_history(id),\n  scope TEXT NOT NULL CHECK (scope = 'global'),\n  actor_id TEXT NOT NULL,\n  actor_name TEXT NOT NULL,\n  approval_reference TEXT NOT NULL,\n  before_prices JSONB NOT NULL,\n  after_prices JSONB NOT NULL,\n  live_version TEXT NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/manual-price-control.spec.js:49:28": {
    "chunks": [
      "SELECT COUNT(*)::int n FROM manual_price_actions"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/tests/manual-price-control.spec.js:50:29": {
    "chunks": [
      "DROP SCHEMA manual_price_fresh CASCADE"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/manual-price-control.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "schema"
  },
  "owned-tests/tests/publish-safe-stock-index.spec.js:21:30": {
    "chunks": [
      "INSERT INTO stock_batches(id,description,location,warehouse_id,\n          batch_no,expiry_date,quantity,remaining_quantity,status)\n          VALUES($1,$2,$3,$4,$1,'2035-12-31',1,1,'available')"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/publish-safe-stock-index.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "write"
  },
  "owned-tests/tests/publish-safe-stock-index.spec.js:33:31": {
    "chunks": [
      "SELECT pg_get_indexdef(indexrelid) AS definition\n        FROM pg_index WHERE indexrelid IN (\n          'cost_stock_location_product'::regclass,'cost_stock_warehouse_product'::regclass)"
    ],
    "slots": [],
    "kind": "statement",
    "group": "tests/publish-safe-stock-index.spec.js",
    "contexts": [
      "service",
      "request",
      "transaction",
      "startup",
      "worker"
    ],
    "operation": "read"
  },
  "owned-tests/atomic-rollback": {
    "chunks": [
      "INSERT INTO stock_movements (id,product_name,quantity,movement_type,source_location,destination_location,status) VALUES ('TEST-SAFETY-ROLLBACK',$1,1,'received','supplier',$2,'posted')"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "write",
    "group": "tests/stock-safety-atomic.spec.js",
    "contexts": [
      "transaction"
    ]
  },
  "owned-tests/backend-pid": {
    "chunks": [
      "SELECT pg_backend_pid() AS pid"
    ],
    "slots": [],
    "kind": "statement",
    "operation": "read",
    "group": "tests/transfer-dispatch-cancel-concurrency.spec.js",
    "contexts": [
      "transaction"
    ]
  }
};
