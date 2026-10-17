/**
 * @typedef {'legacy'|'code-only'} StartupMode
 * @typedef {Readonly<{startupMode: StartupMode, writesAllowed: boolean,
 * allowSchemaSync: boolean, allowReferenceSeeds: boolean,
 * allowInventorySeed: boolean, allowStockSummaryDDL: boolean,
 * enableStockScheduler: boolean}>} StartupPolicy
 */
const permissionFlags = ['ALLOW_SCHEMA_SYNC', 'ALLOW_REFERENCE_SEEDS',
  'ALLOW_INVENTORY_SEED', 'ALLOW_STOCK_SUMMARY_DDL', 'ENABLE_STOCK_SCHEDULER'];

/** Legacy deliberately preserves the previous coupled bootstrap in full.
 * Code-only is a hard barrier, not a collection of independently overridable flags.
 * Do not partially run the legacy bootstrap: its DDL/seeds/repairs are interdependent.
 * @returns {StartupPolicy}
 */
export function createStartupPolicy(env = {}) {
  if(env.REPLIT_DEPLOYMENT!==undefined&&!['0','1','false','true'].includes(env.REPLIT_DEPLOYMENT))
    throw new Error('Invalid REPLIT_DEPLOYMENT marker');
  if(env.NODE_ENV!==undefined&&!['development','test','production'].includes(env.NODE_ENV))
    throw new Error('Invalid NODE_ENV startup marker');
  const production = env.NODE_ENV === 'production' || ['1','true'].includes(env.REPLIT_DEPLOYMENT);
  if (production) {
    if (env.STARTUP_MODE !== 'code-only')
      throw new Error('Production requires explicit STARTUP_MODE=code-only');
    for (const flag of [...permissionFlags, 'ENABLE_STOCK_HEALTH_DIGEST', 'WORKER_ENABLED'])
      if (env[flag] !== 'false')
        throw new Error(`Production requires explicit ${flag}=false`);
    for (const [flag, value] of Object.entries(env))
      if (flag.startsWith('WORKER_') && !['WORKER_TIMEZONE', 'WORKER_DATABASE_URL',
        'WORKER_SCOPE', 'WORKER_MAX_ATTEMPTS', 'WORKER_TIMEOUT_MS',
        'WORKER_BACKOFF_MS', 'WORKER_POLL_MS'].includes(flag) && value !== 'false')
        throw new Error(`Web startup forbids enabled or invalid worker flag: ${flag}`);
  }
  const startupMode = env.STARTUP_MODE ?? 'legacy';
  if (!['legacy', 'code-only'].includes(startupMode))
    throw new Error('Invalid STARTUP_MODE; expected legacy or code-only');
  for (const flag of permissionFlags) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag]))
      throw new Error(`Invalid boolean configuration: ${flag}`);
    if (startupMode === 'code-only' && env[flag] === 'true')
      throw new Error(`STARTUP_MODE=code-only forbids ${flag}=true`);
  }
  const allowed = startupMode === 'legacy';
  return Object.freeze({startupMode, writesAllowed: allowed,
    allowSchemaSync: allowed, allowReferenceSeeds: allowed,
    allowInventorySeed: allowed, allowStockSummaryDDL: allowed,
    enableStockScheduler: allowed});
}

// Explicit web launcher is safe even outside a platform-marked production process.
export function assertCodeOnlyWebProfile(env) {
  return createStartupPolicy({...env, NODE_ENV:'production'});
}

// The legacy entrypoint remains one indivisible operation to preserve its ordering,
// exception boundaries and existing disabled historical-repair guard.
export const LEGACY_BOOTSTRAP_EFFECTS = Object.freeze([
  'database-connectivity-read', 'warehouse-location-seed', 'initial-admin-seed',
  'branch-alias-normalization', 'canonical-branch-seed', 'completed-status-normalization',
  'schema-sync', 'client-history-migration-production-guard',
  'controlled-stock-schema', 'automation-config-seed', 'campaign-schema',
  'petty-cash-schema', 'distributor-bonus-schema', 'supplier-order-schema',
  'payment-voucher-schema', 'distributor-statement-schema', 'system-settings-schema',
  'receipt-counter-schema', 'appointment-branch-normalization',
  'report-branch-backfill', 'report-branch-normalization', 'inventory-balance-seed',
  'disabled-historical-stock-repairs', 'stock-summary-ddl', 'stock-scheduler',
  'scheduler-missed-run-backfill', 'scheduler-periodic-jobs', 'staff-reference-seed',
  'due-price-activation-at-startup',
]);
export const STARTUP_OPERATIONS = Object.freeze({
  'runtime-version-file': [],
  'uploads-directory': [],
  'video-cache-cleanup-timer': [],
  'price-catalogue-bootstrap': ['price-schema', 'price-import-schema',
    'product-package-seeds', 'product-code-cif-seed'],
  'price-activation-timer': ['request-due-price-activation'],
  'legacy-database-bootstrap': LEGACY_BOOTSTRAP_EFFECTS,
});

export function runStartupOperation(policy, operation, execute, log = console.info) {
  if (!Object.hasOwn(STARTUP_OPERATIONS, operation))
    throw new Error('Unregistered startup operation');
  if (policy.startupMode !== 'legacy') {
    for (const name of [operation, ...STARTUP_OPERATIONS[operation]])
      log(JSON.stringify({event:'startup.operation.skipped', operation:name,
        startupMode:policy.startupMode, reason:'code-only policy'}));
    return undefined;
  }
  return execute();
}

export function healthDigestEnabled(env = {}) {
  const value = env.ENABLE_STOCK_HEALTH_DIGEST;
  if (value !== undefined && !['true', 'false'].includes(value))
    throw new Error('Invalid ENABLE_STOCK_HEALTH_DIGEST');
  return value !== 'false';
}
