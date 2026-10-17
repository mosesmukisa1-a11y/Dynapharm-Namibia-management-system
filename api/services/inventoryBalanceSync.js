import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { query, withTransaction } from '../db.js';
import { recomputeInventoryBalanceTx } from './stockEngine.js';
import { day } from './stockCostLayers.js';

/**
 * Compatibility entry point: supplied rows identify dirty cache keys only.
 * Quantities/prices must come from persisted physical/status and cost layers,
 * never from a possibly stale caller payload. The central writer coordinates
 * with location refreshes using the same advisory lock.
 */
export async function syncInventoryBalances(rows) {
  const keys = new Map();
  for (const row of rows || []) {
    const locationId = row.branch_id;
    const productName = row.product_name?.trim();
    if (!locationId?.trim() || !productName) throw new Error('Branch and product are required for balance sync');
    const key = { locationType: 'branch', locationId, productName,
      batchNo: row.batch_no || '', expiryDate: day(row.expiry_date) };
    const identity = JSON.stringify([locationId, productName.toLowerCase(), key.batchNo, key.expiryDate]);
    keys.set(identity, key);
  }
  const ordered = [...keys].sort(([a], [b]) => a.localeCompare(b)).map(([, key]) => key);
  // Historical duplicates must be reviewed, not deleted or silently collapsed.
  // This is a preflight, not the concurrency guard: central advisory locking
  // below serializes all cooperating writers before their balance reads.
  for (const key of ordered) {
    const existing = await __qd_executePlan(query, __qd_registeredPlan("api/services/inventoryBalanceSync.js:27:0"),



    [key.locationId, key.productName, key.batchNo, key.expiryDate]);
    if (existing.rows.length > 1) {
      const error = new Error('Existing balance identity requires review before syncing; no rows were deleted');
      error.code = 'STOCK_BALANCE_IDENTITY_REVIEW';
      error.statusCode = 409;
      throw error;
    }
  }
  for (const key of ordered) await withTransaction(async (client) => {
    await recomputeInventoryBalanceTx(client, key);
    // Recheck under the central writer's location lock. A concurrently inserted
    // genuine duplicate must roll this transaction back. A unique spelling
    // variant is reusable; the central writer retains its stored spelling.
    const result = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/inventoryBalanceSync.js:44:1"),



    [key.locationId, key.productName, key.batchNo, key.expiryDate]);
    if (result.rows.length !== 1) {
      const error = new Error('Existing balance identity requires review before syncing; no rows were deleted');
      error.code = 'STOCK_BALANCE_IDENTITY_REVIEW';
      error.statusCode = 409;
      throw error;
    }
  });
}

/**
 * Include cached and journal identities so removing the last physical row can
 * zero its cache. A journal-only identity still projects zero owned stock.
 */
export async function syncBranchProductBalance(branchId, productName, batchNo = null) {
  if (!branchId?.trim() || !productName?.trim()) throw new Error('Branch and product are required for balance sync');
  const result = await __qd_executePlan(query, __qd_registeredPlan("api/services/inventoryBalanceSync.js:64:2"),














  [branchId, productName, batchNo]);
  await syncInventoryBalances(result.rows);
}
