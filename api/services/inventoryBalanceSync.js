import { query, withTransaction } from '../db.js';
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
    const key = {locationType:'branch',locationId,productName,
      batchNo:row.batch_no || '',expiryDate:day(row.expiry_date)};
    const identity = JSON.stringify([locationId,productName.toLowerCase(),key.batchNo,key.expiryDate]);
    keys.set(identity,key);
  }
  const ordered = [...keys].sort(([a],[b])=>a.localeCompare(b)).map(([,key])=>key);
  // Historical duplicates must be reviewed, not deleted or silently collapsed.
  // This is a preflight, not the concurrency guard: central advisory locking
  // below serializes all cooperating writers before their balance reads.
  for (const key of ordered) {
    const existing = await query(`SELECT id,location_id FROM inventory_balances
      WHERE location_type='branch' AND LOWER(TRIM(location_id))=LOWER(TRIM($1))
        AND LOWER(TRIM(product_name))=LOWER(TRIM($2)) AND COALESCE(batch_no,'')=$3
        AND expiry_date IS NOT DISTINCT FROM $4::date`,
    [key.locationId,key.productName,key.batchNo,key.expiryDate]);
    if (existing.rows.length>1) {
      const error = new Error('Existing balance identity requires review before syncing; no rows were deleted');
      error.code = 'STOCK_BALANCE_IDENTITY_REVIEW';
      error.statusCode = 409;
      throw error;
    }
  }
  for (const key of ordered) await withTransaction(async client=>{
    await recomputeInventoryBalanceTx(client,key);
    // Recheck under the central writer's location lock. A concurrently inserted
    // genuine duplicate must roll this transaction back. A unique spelling
    // variant is reusable; the central writer retains its stored spelling.
    const result=await client.query(`SELECT location_id FROM inventory_balances
      WHERE location_type='branch' AND LOWER(TRIM(location_id))=LOWER(TRIM($1))
        AND LOWER(TRIM(product_name))=LOWER(TRIM($2)) AND COALESCE(batch_no,'')=$3
        AND expiry_date IS NOT DISTINCT FROM $4::date`,
    [key.locationId,key.productName,key.batchNo,key.expiryDate]);
    if(result.rows.length!==1){
      const error=new Error('Existing balance identity requires review before syncing; no rows were deleted');
      error.code='STOCK_BALANCE_IDENTITY_REVIEW';
      error.statusCode=409;
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
  const result = await query(`SELECT DISTINCT branch_id,product_name,batch_no,expiry_date FROM (
    SELECT branch_id,product_name,COALESCE(batch_no,'') batch_no,expiry_date
      FROM branch_inventory_batches
    UNION
    SELECT location_id,product_name,COALESCE(batch_no,''),expiry_date
      FROM inventory_balances WHERE location_type='branch'
    UNION
    SELECT destination_location,product_name,COALESCE(batch_no,''),expiry_date
      FROM stock_movements WHERE destination_location_type='branch'
    UNION
    SELECT source_location,product_name,COALESCE(batch_no,''),expiry_date
      FROM stock_movements WHERE source_location_type='branch'
  ) identities WHERE LOWER(TRIM(branch_id))=LOWER(TRIM($1))
    AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
    AND ($3::text IS NULL OR batch_no=$3)`,
  [branchId,productName,batchNo]);
  await syncInventoryBalances(result.rows);
}
