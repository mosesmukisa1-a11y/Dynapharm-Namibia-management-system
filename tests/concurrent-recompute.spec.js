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

// ─── Country-stock concurrent import receipt + warehouse dispatch ─────────────
//
// This scenario mirrors what happens in production when a supplier import
// (api/stock/import/receive.js) and a GM-approved country→warehouse dispatch
// (api/stock/transfers.js) both complete at roughly the same time for the
// same country_stock product:
//
//   • receive.js commits its transaction, then calls
//     recomputeLocationBalances('country', 'country_stock')
//   • transfers.js (GM approve path) commits its transaction, then also calls
//     recomputeLocationBalances('country', 'country_stock')
//
// Both fan out into multiple recomputeInventoryBalance calls for the same
// (country_stock, product, batch) key.  The pg_advisory_xact_lock inside
// recomputeInventoryBalance serialises them so neither overwrites the other
// with a stale read.

const CS_LOCATION  = 'country_stock';
const CS_LOC_TYPE  = 'country';
const CS_PRODUCT   = 'CONCURRENT_CS_TEST_PRODUCT';
const CS_BATCH     = 'CS-BATCH-CONCURRENT-001';

async function cleanupCountryStock() {
  await query(
    `DELETE FROM inventory_balances
     WHERE location_type = $1 AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
    [CS_LOC_TYPE, CS_LOCATION, CS_PRODUCT]
  );
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
    [CS_PRODUCT]
  );
}

async function insertCsMovement(type, qty, { src, srcType, dst, dstType } = {}) {
  await query(
    `INSERT INTO stock_movements
       (id, product_name, batch_no, quantity, movement_type,
        source_location, source_location_type,
        destination_location, destination_location_type,
        status, movement_date, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4,
             $5, $6, $7, $8,
             'posted', NOW(), NOW(), NOW())`,
    [CS_PRODUCT, CS_BATCH, qty, type,
     src || null, srcType || null, dst || null, dstType || null]
  );
}

describe('recomputeLocationBalances — concurrent country_stock import receipt + warehouse dispatch (DB-backed)', () => {
  beforeAll(cleanupCountryStock);
  afterAll(cleanupCountryStock);

  it('two concurrent recomputeLocationBalances calls leave the correct country_stock balance', async () => {
    // Simulate movements that would be posted by a supplier import receipt (inward)
    // and a country→warehouse dispatch (outward) for the same product+batch.
    //
    // Inward to country_stock (supplier_import_receipt):
    //   +50, +30  →  inward total = 80
    // Outward from country_stock (warehouse_dispatch):
    //   -20, -15  →  outward total = 35
    // Expected closing_qty = 80 - 35 = 45
    await insertCsMovement('supplier_import_receipt', 50, { dst: CS_LOCATION, dstType: CS_LOC_TYPE });
    await insertCsMovement('supplier_import_receipt', 30, { dst: CS_LOCATION, dstType: CS_LOC_TYPE });
    await insertCsMovement('warehouse_dispatch',      20, { src: CS_LOCATION, srcType: CS_LOC_TYPE });
    await insertCsMovement('warehouse_dispatch',      15, { src: CS_LOCATION, srcType: CS_LOC_TYPE });

    // Simulate two concurrent callers (import-receive path + transfer-approve path)
    // both triggering recomputeLocationBalances for country_stock at the same time.
    await Promise.all([
      recomputeLocationBalances(CS_LOC_TYPE, CS_LOCATION),
      recomputeLocationBalances(CS_LOC_TYPE, CS_LOCATION),
    ]);

    // Exactly one balance row for the product.
    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, CS_PRODUCT, CS_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(80);
    expect(Number(rows[0].outward_qty)).toBe(35);
    expect(Number(rows[0].closing_qty)).toBe(45);
  });

  it('a third concurrent wave after more imports and dispatches still lands on the correct balance', async () => {
    // Add one more import receipt (+12) and one more warehouse dispatch (-7).
    // New totals: inward = 92, outward = 42, closing = 50.
    await insertCsMovement('supplier_import_receipt', 12, { dst: CS_LOCATION, dstType: CS_LOC_TYPE });
    await insertCsMovement('warehouse_dispatch',       7, { src: CS_LOCATION, srcType: CS_LOC_TYPE });

    await Promise.all([
      recomputeLocationBalances(CS_LOC_TYPE, CS_LOCATION),
      recomputeLocationBalances(CS_LOC_TYPE, CS_LOCATION),
      recomputeLocationBalances(CS_LOC_TYPE, CS_LOCATION),
    ]);

    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, CS_PRODUCT, CS_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(92);
    expect(Number(rows[0].outward_qty)).toBe(42);
    expect(Number(rows[0].closing_qty)).toBe(50);
  });
});

// ─── In-transit concurrent recompute ─────────────────────────────────────────
//
// The in_transit location type represents goods physically between a warehouse
// and a branch (the stock_transfers.status column reaches 'in_transit' or
// 'dispatched' during this window).
//
// Concurrent recomputes can race when two calls both trigger
// recomputeLocationBalances('in_transit', transitId) — for example if a
// warehouse marks a consignment dispatched while the branch simultaneously
// confirms partial receipt.
//
// Movement type semantics relative to the in_transit location:
//   • transfer_in  — goods enter the transit pipeline (destination=in_transit);
//                    this is in INWARD_TYPES.
//   • branch_receipt — goods leave transit upon delivery to branch
//                      (source=in_transit); this is in OUTWARD_TYPES.
//
// Note: transfer_out is in OUTWARD_TYPES (outward from the *source* warehouse)
// not INWARD_TYPES, so it cannot count as inward to in_transit in the engine.
// transfer_in is the correct inward counterpart.

const IT_LOCATION  = 'in_transit_test_001';
const IT_LOC_TYPE  = 'in_transit';
const IT_PRODUCT   = 'CONCURRENT_IT_TEST_PRODUCT';
const IT_BATCH     = 'IT-BATCH-CONCURRENT-001';

async function cleanupInTransit() {
  await query(
    `DELETE FROM inventory_balances
     WHERE location_type = $1 AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
    [IT_LOC_TYPE, IT_LOCATION, IT_PRODUCT]
  );
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
    [IT_PRODUCT]
  );
}

async function insertItMovement(type, qty, { src, srcType, dst, dstType } = {}) {
  await query(
    `INSERT INTO stock_movements
       (id, product_name, batch_no, quantity, movement_type,
        source_location, source_location_type,
        destination_location, destination_location_type,
        status, movement_date, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4,
             $5, $6, $7, $8,
             'posted', NOW(), NOW(), NOW())`,
    [IT_PRODUCT, IT_BATCH, qty, type,
     src || null, srcType || null, dst || null, dstType || null]
  );
}

describe('recomputeLocationBalances — concurrent in_transit transfer in + branch receipt (DB-backed)', () => {
  beforeAll(cleanupInTransit);
  afterAll(cleanupInTransit);

  it('two concurrent recomputeLocationBalances calls leave the correct in_transit balance', async () => {
    // Simulate movements that would be posted when goods enter and leave
    // the in_transit pipeline for the same product+batch.
    //
    // Inward to in_transit (transfer_in — INWARD_TYPES):
    //   +25, +15  →  inward total = 40
    // Outward from in_transit (branch_receipt — OUTWARD_TYPES when source=in_transit):
    //   -10, -6   →  outward total = 16
    // Expected closing_qty = 40 - 16 = 24
    await insertItMovement('transfer_in',    25, { dst: IT_LOCATION, dstType: IT_LOC_TYPE });
    await insertItMovement('transfer_in',    15, { dst: IT_LOCATION, dstType: IT_LOC_TYPE });
    await insertItMovement('branch_receipt', 10, { src: IT_LOCATION, srcType: IT_LOC_TYPE });
    await insertItMovement('branch_receipt',  6, { src: IT_LOCATION, srcType: IT_LOC_TYPE });

    // Simulate two concurrent callers both triggering recomputeLocationBalances
    // for the same in_transit ID at the same time.
    await Promise.all([
      recomputeLocationBalances(IT_LOC_TYPE, IT_LOCATION),
      recomputeLocationBalances(IT_LOC_TYPE, IT_LOCATION),
    ]);

    // Exactly one balance row for the product.
    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_LOCATION, IT_PRODUCT, IT_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(40);
    expect(Number(rows[0].outward_qty)).toBe(16);
    expect(Number(rows[0].closing_qty)).toBe(24);
  });

  it('a third concurrent wave after more in-transit movements still lands on the correct balance', async () => {
    // Add one more transfer_in (+8) and one more branch_receipt (-5).
    // New totals: inward = 48, outward = 21, closing = 27.
    await insertItMovement('transfer_in',    8, { dst: IT_LOCATION, dstType: IT_LOC_TYPE });
    await insertItMovement('branch_receipt', 5, { src: IT_LOCATION, srcType: IT_LOC_TYPE });

    await Promise.all([
      recomputeLocationBalances(IT_LOC_TYPE, IT_LOCATION),
      recomputeLocationBalances(IT_LOC_TYPE, IT_LOCATION),
      recomputeLocationBalances(IT_LOC_TYPE, IT_LOCATION),
    ]);

    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_LOCATION, IT_PRODUCT, IT_BATCH]
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].inward_qty)).toBe(48);
    expect(Number(rows[0].outward_qty)).toBe(21);
    expect(Number(rows[0].closing_qty)).toBe(27);
  });
});

// ─── In-transit cancellation path ────────────────────────────────────────────
//
// When a warehouse cancels a dispatched transfer, the system must void the
// associated stock movements (status → 'cancelled').  A subsequent
// recomputeLocationBalances call should then reflect zero closing_qty for
// the in_transit location, because recomputeInventoryBalance only counts
// movements with status IN ('posted', 'approved').
//
// If the cancellation handler omits the void step — or sets the wrong status
// — the in_transit balance will permanently overstate goods in flight.
//
// This block uses its own isolated namespace (IT_CANCEL_*) to avoid
// interfering with the cumulative movement totals in the concurrent tests above.

const IT_CANCEL_LOCATION = 'in_transit_cancel_test_001';
const IT_CANCEL_PRODUCT  = 'IT_CANCEL_TEST_PRODUCT';
const IT_CANCEL_BATCH    = 'IT-CANCEL-BATCH-001';

async function cleanupInTransitCancel() {
  await query(
    `DELETE FROM inventory_balances
     WHERE location_type = $1 AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
    [IT_LOC_TYPE, IT_CANCEL_LOCATION, IT_CANCEL_PRODUCT]
  );
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
    [IT_CANCEL_PRODUCT]
  );
}

describe('recomputeLocationBalances — in_transit balance drops to zero after cancellation (DB-backed)', () => {
  beforeAll(cleanupInTransitCancel);
  afterAll(cleanupInTransitCancel);

  it('cancelling in_transit movements causes recompute to return closing_qty = 0', async () => {
    // Step 1 — insert two inward movements (transfer_in → in_transit).
    // Total inward = 30, outward = 0, closing = 30.
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          status, movement_date, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, 20, 'transfer_in',
          null, null, $3, $4,
          'posted', NOW(), NOW(), NOW()),
         (gen_random_uuid()::text, $1, $2, 10, 'transfer_in',
          null, null, $3, $4,
          'posted', NOW(), NOW(), NOW())`,
      [IT_CANCEL_PRODUCT, IT_CANCEL_BATCH, IT_CANCEL_LOCATION, IT_LOC_TYPE]
    );

    // Step 2 — recompute; balance should reflect the two inward movements.
    await recomputeLocationBalances(IT_LOC_TYPE, IT_CANCEL_LOCATION);

    const { rows: before } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_CANCEL_LOCATION, IT_CANCEL_PRODUCT, IT_CANCEL_BATCH]
    );

    expect(before).toHaveLength(1);
    expect(Number(before[0].inward_qty)).toBe(30);
    expect(Number(before[0].closing_qty)).toBe(30);

    // Step 3 — void the movements by setting their status to 'cancelled',
    // mirroring what the transfer cancellation handler does in transfers.js.
    await query(
      `UPDATE stock_movements
       SET status = 'cancelled', updated_at = NOW()
       WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
         AND destination_location = $2
         AND status IN ('posted', 'approved')`,
      [IT_CANCEL_PRODUCT, IT_CANCEL_LOCATION]
    );

    // Step 4 — recompute again; cancelled movements must not be counted.
    await recomputeLocationBalances(IT_LOC_TYPE, IT_CANCEL_LOCATION);

    const { rows: after } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1
         AND location_id   = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_CANCEL_LOCATION, IT_CANCEL_PRODUCT, IT_CANCEL_BATCH]
    );

    expect(after).toHaveLength(1);
    expect(Number(after[0].inward_qty)).toBe(0);
    expect(Number(after[0].outward_qty)).toBe(0);
    expect(Number(after[0].closing_qty)).toBe(0);
  });

  it('partially cancelling in_transit movements reduces closing_qty proportionally', async () => {
    // Insert three inward movements: 10 + 15 + 5 = 30 total.
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          status, movement_date, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, 10, 'transfer_in',
          null, null, $3, $4,
          'posted', NOW(), NOW(), NOW()),
         (gen_random_uuid()::text, $1, $2, 15, 'transfer_in',
          null, null, $3, $4,
          'posted', NOW(), NOW(), NOW()),
         (gen_random_uuid()::text, $1, $2,  5, 'transfer_in',
          null, null, $3, $4,
          'posted', NOW(), NOW(), NOW())`,
      [IT_CANCEL_PRODUCT, IT_CANCEL_BATCH, IT_CANCEL_LOCATION, IT_LOC_TYPE]
    );

    // Recompute: balance is now 30 (from the three new movements; cancelled
    // ones from the previous test are already excluded).
    await recomputeLocationBalances(IT_LOC_TYPE, IT_CANCEL_LOCATION);

    const { rows: full } = await query(
      `SELECT closing_qty FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_CANCEL_LOCATION, IT_CANCEL_PRODUCT, IT_CANCEL_BATCH]
    );
    expect(Number(full[0].closing_qty)).toBe(30);

    // Cancel only the qty=15 movement, leaving 10 + 5 = 15 posted.
    await query(
      `UPDATE stock_movements
       SET status = 'cancelled', updated_at = NOW()
       WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
         AND destination_location = $2
         AND quantity = 15
         AND status IN ('posted', 'approved')`,
      [IT_CANCEL_PRODUCT, IT_CANCEL_LOCATION]
    );

    await recomputeLocationBalances(IT_LOC_TYPE, IT_CANCEL_LOCATION);

    const { rows: partial } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [IT_LOC_TYPE, IT_CANCEL_LOCATION, IT_CANCEL_PRODUCT, IT_CANCEL_BATCH]
    );

    expect(partial).toHaveLength(1);
    expect(Number(partial[0].inward_qty)).toBe(15);  // 10 + 5
    expect(Number(partial[0].outward_qty)).toBe(0);
    expect(Number(partial[0].closing_qty)).toBe(15);
  });
});
