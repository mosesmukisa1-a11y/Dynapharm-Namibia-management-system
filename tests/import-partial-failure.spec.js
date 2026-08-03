/**
 * Supplier import partial-failure test (DB-backed)
 *
 * api/stock/import/receive.js loops over items calling postStockMovement()
 * and a stock_batches INSERT for each one — with no wrapping transaction.
 * If item N fails after items 1…N-1 have already posted their movements,
 * those earlier movements stay committed in stock_movements and their balances
 * are already reflected in inventory_balances (postStockMovement calls
 * recomputeInventoryBalance inline).
 *
 * This test exercises the handler directly and forces item 3 to fail by
 * supplying an invalid expiry date ('INVALID-DATE') that passes the handler's
 * presence-only validation but causes the stock_movements INSERT to throw a
 * PostgreSQL date-cast error.  Items 1 and 2 commit before the failure.
 *
 * Verified behaviour
 * ──────────────────
 * 1. The handler rejects (error propagates; no 201 response).
 * 2. Items 1 and 2 have correct inventory_balances.closing_qty.
 * 3. No inventory_balances row exists for item 3 (movement never committed).
 * 4. No stock_movements row exists for item 3.
 * 5. A retry import for item 3 alone produces the correct balance without
 *    disturbing items 1 and 2.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock/import/receive.js';

const CS_LOCATION = 'country_stock';
const CS_LOC_TYPE = 'country';

const PRODUCT_A = 'IMPORT_PARTIAL_HANDLER_TEST_PRODUCT_A';
const PRODUCT_B = 'IMPORT_PARTIAL_HANDLER_TEST_PRODUCT_B';
const PRODUCT_C = 'IMPORT_PARTIAL_HANDLER_TEST_PRODUCT_C';

const BATCH_A = 'BATCH-HANDLER-PARTIAL-A-001';
const BATCH_B = 'BATCH-HANDLER-PARTIAL-B-001';
const BATCH_C = 'BATCH-HANDLER-PARTIAL-C-001';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function cleanup() {
  for (const product of [PRODUCT_A, PRODUCT_B, PRODUCT_C]) {
    await query(
      `DELETE FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
      [CS_LOC_TYPE, CS_LOCATION, product]
    );
    await query(
      `DELETE FROM stock_movements
       WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
      [product]
    );
  }
  for (const batch of [BATCH_A, BATCH_B, BATCH_C]) {
    await query(
      `DELETE FROM stock_batches WHERE batch_no = $1`,
      [batch]
    );
  }
}

/**
 * Build a minimal mock req/res pair for calling handler() directly.
 * res captures the status code and JSON body; it also records whether
 * a response was sent at all.
 */
function mockReqRes(body) {
  const req = { method: 'POST', body };
  const captured = { sent: false, statusCode: null, body: null };
  const res = {
    status(code) {
      captured.statusCode = code;
      return {
        json(b) {
          captured.sent = true;
          captured.body = b;
          return captured;
        }
      };
    },
    json(b) {
      captured.sent = true;
      captured.statusCode = 200;
      captured.body = b;
      return captured;
    }
  };
  return { req, res, captured };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('country_stock balances after a mid-batch supplier import failure — handler-level (DB-backed)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('handler throws when item 3 has an invalid expiry date; items 1 and 2 movements are already committed', async () => {
    const { req, res } = mockReqRes({
      supplierId: 'supplier-test',
      supplierImportId: 'imp-partial-handler-test-001',
      receivedBy: 'test-user',
      notes: 'partial-failure test',
      items: [
        // Items 1 and 2 are fully valid — they will commit successfully.
        {
          productName: PRODUCT_A,
          batchNo: BATCH_A,
          expiryDate: '2027-12-31',
          quantity: 40,
          unitDP: 5,
        },
        {
          productName: PRODUCT_B,
          batchNo: BATCH_B,
          expiryDate: '2027-06-30',
          quantity: 25,
          unitDP: 3,
        },
        // Item 3: 'INVALID-DATE' passes the presence-only check (!item.expiryDate)
        // but causes the stock_movements INSERT to throw a PostgreSQL date-cast error.
        {
          productName: PRODUCT_C,
          batchNo: BATCH_C,
          expiryDate: 'INVALID-DATE',
          quantity: 15,
          unitDP: 2,
        },
      ],
    });

    // The handler should throw because the item-3 DB write fails and there is
    // no try/catch around the per-item loop.
    await expect(handler(req, res)).rejects.toThrow();
  });

  it('inventory_balances for items 1 and 2 are correct after the partial failure', async () => {
    // postStockMovement() calls recomputeInventoryBalance() inline, so the
    // balances for items A and B were already written before the loop threw.

    const { rows: rowsA } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_A, BATCH_A]
    );

    expect(rowsA).toHaveLength(1);
    expect(Number(rowsA[0].inward_qty)).toBe(40);
    expect(Number(rowsA[0].outward_qty)).toBe(0);
    expect(Number(rowsA[0].closing_qty)).toBe(40);

    const { rows: rowsB } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_B, BATCH_B]
    );

    expect(rowsB).toHaveLength(1);
    expect(Number(rowsB[0].inward_qty)).toBe(25);
    expect(Number(rowsB[0].outward_qty)).toBe(0);
    expect(Number(rowsB[0].closing_qty)).toBe(25);
  });

  it('no inventory_balances or stock_movements row exists for the failed item 3', async () => {
    // Item 3's postStockMovement() threw before completing the INSERT, so
    // no movement row was committed.

    const { rows: movRows } = await query(
      `SELECT id FROM stock_movements
       WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
      [PRODUCT_C]
    );
    expect(movRows).toHaveLength(0);

    // No movement → recomputeInventoryBalance was never called for C →
    // no inventory_balances row should exist.
    const { rows: balRows } = await query(
      `SELECT closing_qty FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_C, BATCH_C]
    );
    expect(balRows).toHaveLength(0);
  });

  it('a successful retry import for item 3 produces the correct balance; items 1 and 2 are unaffected', async () => {
    // Operator re-submits only item C with the corrected expiry date.
    const { req, res, captured } = mockReqRes({
      supplierId: 'supplier-test',
      supplierImportId: 'imp-partial-handler-retry-001',
      receivedBy: 'test-user',
      notes: 'partial-failure retry',
      items: [
        {
          productName: PRODUCT_C,
          batchNo: BATCH_C,
          expiryDate: '2027-09-30',   // valid date this time
          quantity: 15,
          unitDP: 2,
        },
      ],
    });

    await handler(req, res);

    expect(captured.sent).toBe(true);
    expect(captured.statusCode).toBe(201);
    expect(captured.body.success).toBe(true);
    expect(captured.body.itemsPosted).toBe(1);

    // Item C now has a correct balance.
    const { rows: rowsC } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_C, BATCH_C]
    );

    expect(rowsC).toHaveLength(1);
    expect(Number(rowsC[0].inward_qty)).toBe(15);
    expect(Number(rowsC[0].outward_qty)).toBe(0);
    expect(Number(rowsC[0].closing_qty)).toBe(15);

    // Items A and B are unchanged.
    const { rows: rowsA } = await query(
      `SELECT closing_qty FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_A, BATCH_A]
    );
    expect(Number(rowsA[0].closing_qty)).toBe(40);

    const { rows: rowsB } = await query(
      `SELECT closing_qty FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
         AND COALESCE(batch_no, '') = $4`,
      [CS_LOC_TYPE, CS_LOCATION, PRODUCT_B, BATCH_B]
    );
    expect(Number(rowsB[0].closing_qty)).toBe(25);
  });
});
