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
import { recomputeInventoryBalance } from '../api/services/stockEngine.js';

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
