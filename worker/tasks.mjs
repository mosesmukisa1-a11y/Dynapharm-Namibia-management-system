// An internal capability allowlist, never inferred from legacy exports or config.
// ENABLED means eligible after both explicit operator flags and service checks;
// every runtime flag still defaults false.
export const TASKS=Object.freeze([
  ['daily-summary','WORKER_DAILY_SUMMARY','DISABLED_PENDING_REPAIR','api/services/stockScheduler.js#computeDailyStockSummary','00:05','Legacy snapshot writer needs deterministic period/scoped transactional proof.'],
  ['weekly-summary','WORKER_WEEKLY_SUMMARY','DISABLED_PENDING_REPAIR','api/services/stockScheduler.js#computeWeeklySummary','Monday00:10','Depends on verified daily inputs and frozen historical periods.'],
  ['monthly-summary','WORKER_MONTHLY_SUMMARY','DISABLED_PENDING_REPAIR','api/services/stockScheduler.js#computeMonthlySummary','month-first00:15','Depends on verified daily inputs and frozen historical periods.'],
  ['summary-backfill','WORKER_SUMMARY_BACKFILL','DISABLED_UNSAFE','api/services/stockScheduler.js#backfillMissedRuns','explicit only','No unattended historical reconstruction authority.'],
  ['expiry-scan','WORKER_EXPIRY_SCAN','DISABLED_PENDING_REPAIR','api/services/stockAutomation.js#runAutoWriteOff','00:20','Legacy multi-batch proposal lacks worker run transaction/idempotency proof.'],
  ['receipt-reminders','WORKER_RECEIPT_REMINDERS','DISABLED_PENDING_REPAIR','api/services/stockAutomation.js#runAutoReceiveDispatched','each minute','Reminder-only legacy helper needs atomic notification outbox deduplication.'],
  ['approval-escalation','WORKER_APPROVAL_ESCALATION','DISABLED_PENDING_REPAIR','api/services/stockAutomation.js#runPendingApprovalEscalation','working-hour four-hourly','Notification/approval event replay not yet proven.'],
  ['warehouse-reorder','WORKER_REORDER_REQUESTS','DISABLED_UNSAFE','api/services/stockAutomation.js#runWarehouseReorderCheck','00:30','No approved rule/threshold authority for system-created requests.'],
  ['redistribution','WORKER_REDISTRIBUTION','DISABLED_PENDING_REPAIR','api/services/stockAutomation.js#runInterBranchRedistribution','01:05','Legacy suggestion/request writes lack service-scoped idempotency proof.'],
  ['drift-detection','WORKER_DRIFT_DETECTION','ENABLED','worker/drift.mjs#detectDrift','01:00','Read-only exact-ID scoped comparison; only worker-owned findings/audit writes.'],
  ['drift-repair','WORKER_DRIFT_REPAIR','DISABLED_UNSAFE','api/services/stockAutomation.js#runInventoryDriftRepair','never','Repair explicitly requires separate authority; no balancing movements.'],
  ['health-digest','WORKER_HEALTH_DIGEST','DISABLED_PENDING_REPAIR','api/services/stockAutomation.js#runNightlyStockHealthDigest','06:00','Incompatible pp.distributor_price query; original-evidence valuation not proven.'],
  ['scheduled-prices','WORKER_SCHEDULED_PRICE_ACTIVATION','DISABLED_PENDING_REPAIR','server.js#applyPendingPriceChanges','hourly','Scope/approval/overlap/commit recovery require populated proof; no price mutation enabled.'],
  ['stuck-approvals','WORKER_STUCK_APPROVALS','DISABLED_UNSAFE','api/services/stockAutomation.js#runStuckApprovalCleanup','working-hour hourly','Conditional auto-revert is a business action without approved worker authority.'],
].map(([id,flag,status,source,schedule,reason])=>Object.freeze({id,flag,status,source,schedule,reason})));
export const TASK_BY_ID=new Map(TASKS.map(t=>[t.id,t]));
