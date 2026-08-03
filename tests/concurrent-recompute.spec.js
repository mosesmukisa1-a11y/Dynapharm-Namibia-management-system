/**
 * Concurrent recomputeInventoryBalance race-condition test (DB-backed)
 *
 * Verifies that running many parallel recomputes for the same
 * location+product+batch produces exactly one inventory_balances row with
 * a closing_qty that matches the true sum of all posted movements.
 *
 * Before task #145 the advisory lock was missing, so concurrent calls could
 * interleave their reads and writes and leave a stale or wrong balance.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import { recomputeInventoryBalance, recomputeLocationBalances } from '../api/services/stockEngine.js';

const BRANCH   = 'test_concurrent_recompute_branch';
const PRODUCT  = 'CONCURRENT_RECOMPUTE_TEST_PRODUCT';
const BATCH    = 'BATCH-CONCURRENT-TEST-001';
const LOC_TYPE = 'branch';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cleanup() {
  await query(`DELETE FROM inventory_balances
               WHERE location_type = $1 AND location_id = $2
                 AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`, [LOC_TYPE, BRANCH, PRODUCT]);
  await query(`DELETE FROM stock_movements
               WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`, [PRODUCT]);
}

/**
 * Insert a movement row directly so we bypass business-logic guards and get
 * a known, reproducible movement set for the balance check.
 */
async function insertMovement(type, qty, { src, srcType, dst, dstType } = {}) {
  await query(
    `INSERT INTO stock_movements
       (id, product_name, batch_no, quantity, movement_type,
        source_location, source_location_type,
        destination_location, destination_location_type,
        status, movement_date, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4,
             $5, $6, $7, $8,
             'posted', NOW(), NOW(), NOW())`,
    [PRODUCT, BATCH, qty, type, src || null, srcType || null, dst || null, dstType || null]
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('recomputeInventoryBalance — concurrent recompute serialisation (DB-backed)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('5 parallel recomputes produce exactly one row with the correct balance', async () => {
    // Insert known movements.
    // Inward to BRANCH (positive_adjustment — destination_location=BRANCH):
    //   +5, +7, +3  →  inward total = 15
    // Outward from BRANCH (negative_adjustment — source_location=BRANCH):
    //   -4, -3       →  outward total = 7
    // Expected closing_qty = 15 - 7 = 8
    await insertMovement('positive_adjustment', 5, { dst: BRANCH, dstType: LOC_TYPE });
    await insertMovement('positive_adjustment', 7, { dst: BRANCH, dstType: LOC_TYPE });
    await insertMovement('positive_adjustment', 3, { dst: BRANCH, dstType: LOC_TYPE });
    await insertMovement('negative_adjustment', 4, { src: BRANCH, srcType: LOC_TYPE });
    await insertMovement('negative_adjustment', 3, { src: BRANCH, srcType: LOC_TYPE });

    const key = {
      locationType: LOC_TYPE,
      locationId:   BRANCH,
      productName:  PRODUCT,
      batchNo:      BATCH,
    };

    // Run 5 concurrent recomputes — the advisory lock must serialise them so
    // they don't interleave their reads and writes.
    await Promise.all([
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
    ]);

    // Exactly one balance row should exist.
    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [LOC_TYPE, BRANCH, PRODUCT, BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(15);
    expect(Number(rows[0].outward_qty)).toBe(7);
    expect(Number(rows[0].closing_qty)).toBe(8);
  });

  it('second wave of movements followed by parallel recomputes reflects the updated total', async () => {
    // Add 2 more inward (+10) and 1 more outward (-2) on top of the previous state.
    // New totals: inward = 15+10 = 25, outward = 7+2 = 9, closing = 16.
    await insertMovement('positive_adjustment', 10, { dst: BRANCH, dstType: LOC_TYPE });
    await insertMovement('negative_adjustment',  2, { src: BRANCH, srcType: LOC_TYPE });

    const key = {
      locationType: LOC_TYPE,
      locationId:   BRANCH,
      productName:  PRODUCT,
      batchNo:      BATCH,
    };

    await Promise.all([
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
      recomputeInventoryBalance(key),
    ]);

    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [LOC_TYPE, BRANCH, PRODUCT, BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(25);
    expect(Number(rows[0].outward_qty)).toBe(9);
    expect(Number(rows[0].closing_qty)).toBe(16);
  });
});

// ─── Warehouse concurrent dispatch + receipt ──────────────────────────────────
//
// This scenario mirrors what happens in production when a receive-request
// (api/stock/receive-request.js) and a transfer dispatch
// (api/stock/transfers.js / api/stock/dispatch/confirm-receipt.js) both
// complete at roughly the same time for the same warehouse product:
//
//   • receive-request commits its transaction, then calls
//     recomputeLocationBalances('warehouse', warehouseId)
//   • confirm-receipt commits its transaction, then also calls
//     recomputeLocationBalances('warehouse', warehouseId)
//
// Both fan out into multiple recomputeInventoryBalance calls for the same
// (warehouse, product, batch) key.  The pg_advisory_xact_lock inside
// recomputeInventoryBalance serialises them so neither overwrites the other
// with a stale read.

const WAREHOUSE    = 'test_concurrent_warehouse';
const WH_PRODUCT   = 'CONCURRENT_WH_TEST_PRODUCT';
const WH_BATCH     = 'WH-BATCH-CONCURRENT-001';
const WH_LOC_TYPE  = 'warehouse';

async function cleanupWarehouse() {
  await query(
    `DELETE FROM inventory_balances
     WHERE location_type = $1 AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
    [WH_LOC_TYPE, WAREHOUSE, WH_PRODUCT]
  );
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
    [WH_PRODUCT]
  );
}

async function insertWhMovement(type, qty, { src, srcType, dst, dstType } = {}) {
  await query(
    `INSERT INTO stock_movements
       (id, product_name, batch_no, quantity, movement_type,
        source_location, source_location_type,
        destination_location, destination_location_type,
        status, movement_date, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4,
             $5, $6, $7, $8,
             'posted', NOW(), NOW(), NOW())`,
    [WH_PRODUCT, WH_BATCH, qty, type,
     src || null, srcType || null, dst || null, dstType || null]
  );
}

describe('recomputeLocationBalances — concurrent warehouse dispatch + receipt (DB-backed)', () => {
  beforeAll(cleanupWarehouse);
  afterAll(cleanupWarehouse);

  it('two concurrent recomputeLocationBalances calls leave the correct warehouse balance', async () => {
    // Simulate movements that would be posted by a warehouse receipt (inward)
    // and a warehouse dispatch (outward) for the same product+batch.
    //
    // Inward to WAREHOUSE (warehouse_receipt):
    //   +20, +10  →  inward total = 30
    // Outward from WAREHOUSE (warehouse_dispatch):
    //   -8, -5   →  outward total = 13
    // Expected closing_qty = 30 - 13 = 17
    await insertWhMovement('warehouse_receipt',  20, { dst: WAREHOUSE, dstType: WH_LOC_TYPE });
    await insertWhMovement('warehouse_receipt',  10, { dst: WAREHOUSE, dstType: WH_LOC_TYPE });
    await insertWhMovement('warehouse_dispatch',  8, { src: WAREHOUSE, srcType: WH_LOC_TYPE });
    await insertWhMovement('warehouse_dispatch',  5, { src: WAREHOUSE, srcType: WH_LOC_TYPE });

    // Simulate two concurrent callers (receive-request path + dispatch path) both
    // triggering recomputeLocationBalances for the same warehouse at the same time.
    await Promise.all([
      recomputeLocationBalances(WH_LOC_TYPE, WAREHOUSE),
      recomputeLocationBalances(WH_LOC_TYPE, WAREHOUSE),
    ]);

    // Exactly one balance row for the product.
    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [WH_LOC_TYPE, WAREHOUSE, WH_PRODUCT, WH_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(30);
    expect(Number(rows[0].outward_qty)).toBe(13);
    expect(Number(rows[0].closing_qty)).toBe(17);
  });

  it('a third concurrent wave after more dispatches still lands on the correct balance', async () => {
    // Add one more inward (+6) and one more outward (-3).
    // New totals: inward = 36, outward = 16, closing = 20.
    await insertWhMovement('warehouse_receipt',   6, { dst: WAREHOUSE, dstType: WH_LOC_TYPE });
    await insertWhMovement('warehouse_dispatch',  3, { src: WAREHOUSE, srcType: WH_LOC_TYPE });

    await Promise.all([
      recomputeLocationBalances(WH_LOC_TYPE, WAREHOUSE),
      recomputeLocationBalances(WH_LOC_TYPE, WAREHOUSE),
      recomputeLocationBalances(WH_LOC_TYPE, WAREHOUSE),
    ]);

    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [WH_LOC_TYPE, WAREHOUSE, WH_PRODUCT, WH_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(36);
    expect(Number(rows[0].outward_qty)).toBe(16);
    expect(Number(rows[0].closing_qty)).toBe(20);
  });
});
