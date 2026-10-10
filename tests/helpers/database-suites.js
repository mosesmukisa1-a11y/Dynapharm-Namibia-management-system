// DB suites are always serial: whole-database safety baselines cannot overlap
// fixture writers. Everything else runs in the fast, no-database unit project.
export const stockAuditSuites = [
  'tests/stock-lifecycle-end-to-end.spec.js',
  'tests/stock-safety-atomic.spec.js',
  'tests/stock-cost-lifecycle.spec.js',
  'tests/stock-cost-projection-sharing.spec.js',
  'tests/controlled-stock.spec.js',
  'tests/linked-reversals.spec.js',
  'tests/historical-refund-evidence.spec.js',
  'tests/transfer-b2b-receipt-increases-dest-balance.spec.js',
  'tests/branch-receipt-inventory-balance.spec.js',
  'tests/dispatch-note-cancellation.spec.js',
  'tests/transfer-cancel-voids-movements.spec.js',
  'tests/transfer-dispatch-cancel-concurrency.spec.js',
];

export const databaseSuites = [
  ...stockAuditSuites,
  'tests/campaign-free-item-dp.spec.js',
  'tests/daily-campaign-free-item-dp.spec.js',
  'tests/concurrent-recompute.spec.js',
  'tests/import-partial-failure.spec.js',
  'tests/price-list-import.spec.js',
  'tests/publish-safe-stock-index.spec.js',
  'tests/refund-batch-restore.spec.js',
  'tests/refund-ghost-cleanup.spec.js',
];
