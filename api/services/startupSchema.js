import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js"; // Minimum versioned contract for staff authentication and Sales/Stock portals.
// Optional module-specific features may require further objects. This is not a
// data-integrity, index, constraint, type or populated-history certification.
export const REQUIRED_STARTUP_SCHEMA = Object.freeze({
  users: ['id', 'username', 'password_hash', 'role', 'branch', 'is_active'],
  branches: ['id', 'name', 'status'],
  warehouse_locations: ['id', 'name', 'type', 'status'],
  product_prices: ['id', 'description', 'dp', 'cp', 'cif'],
  live_product_prices: ['id', 'description', 'dp', 'cp', 'cif', 'catalogue_entry'],
  stock_batches: ['id', 'description', 'quantity', 'remaining_quantity', 'location', 'batch_no', 'expiry_date'],
  branch_inventory_batches: ['id', 'branch_id', 'product_name', 'quantity', 'status', 'batch_no', 'expiry_date'],
  stock_movements: ['id', 'product_name', 'quantity', 'movement_type', 'source_location', 'destination_location', 'status'],
  branch_inventory_movements: ['id', 'branch_id', 'product_name', 'quantity', 'type'],
  inventory_balances: ['location_id', 'location_type', 'product_name', 'closing_qty'],
  branch_walkin_sales: ['id', 'branch_id', 'sale_number', 'sale_date', 'items', 'total', 'status'],
  stock_requests: ['id', 'status', 'updated_by', 'last_status_change'],
  stock_transfers: ['id', 'status'],
  stock_transfer_items: ['id', 'transfer_id', 'quantity'],
  branch_bank_deposits: ['id', 'branch_id', 'amount', 'status', 'date'],
  branch_expenses: ['id', 'branch_id', 'amount', 'status', 'date'],
  finance_remittances: ['id', 'amount', 'status', 'payment_date'],
  branch_activity_transactions: ['id', 'branch_id', 'workflow_source', 'consultation_fee',
  'product_total_dp', 'product_total_cp', 'stock_impact'],
  clients: ['id', 'reference_number', 'branch'],
  distributors: ['id', 'distributor_code', 'status']
});

export const COMPATIBILITY_SQL = `
  SELECT c.relname AS table_name, a.attname AS column_name,
         has_table_privilege(c.oid, 'SELECT') AS readable
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
    AND a.attnum > 0 AND NOT a.attisdropped
    AND c.relname = ANY($1::text[])`;

export function readinessFor(policy, extra = {}) {
  return { compatible: policy.startupMode === 'legacy' ? null : false,
    missingTables: [], missingColumns: [], unreadableTables: [],
    startupMode: policy.startupMode, writesAllowed: policy.writesAllowed,
    schedulerEnabled: policy.enableStockScheduler, ...extra };
}

export async function checkStartupCompatibility(query, policy, required = REQUIRED_STARTUP_SCHEMA) {
  try {
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/services/startupSchema.js:47:0"), [Object.keys(required)]);
    const columns = new Map();
    const unreadable = new Set();
    for (const row of rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name).add(row.column_name);
      if (row.readable === false) unreadable.add(row.table_name);
    }
    const missingTables = [],missingColumns = [];
    for (const [table, names] of Object.entries(required)) {
      if (!columns.has(table)) missingTables.push(table);else
      for (const name of names)
      if (!columns.get(table).has(name)) missingColumns.push(`${table}.${name}`);
    }
    return readinessFor(policy, { compatible: !missingTables.length &&
      !missingColumns.length && !unreadable.size,
      missingTables, missingColumns, unreadableTables: [...unreadable] });
  } catch {
    // Never expose a database URI, raw SQL error, user data or credentials.
    return readinessFor(policy, { compatible: false,
      error: 'Startup schema compatibility could not be verified' });
  }
}

let currentReadiness = { startupMode: 'legacy', compatible: null, writesAllowed: true,
  schedulerEnabled: true, missingTables: [], missingColumns: [], unreadableTables: [] };
export function setStartupReadiness(value) {currentReadiness = value;}
export function getStartupReadiness() {return currentReadiness;}

// Registered before every static/API/body-parser handler. Only safe503 diagnostics
// are served until a code-only instance has passed its existing-schema check.
export function startupReadinessGate(_req, res, next) {
  if (currentReadiness.startupMode !== 'code-only' || currentReadiness.compatible === true)
  return next();
  return res.status(503).json({ ok: false, status: 'not-ready',
    error: 'Required existing schema is incompatible; automatic repair is disabled',
    startup: currentReadiness });
}
