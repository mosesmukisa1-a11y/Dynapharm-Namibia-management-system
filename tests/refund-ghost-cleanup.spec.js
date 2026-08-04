// @vitest-environment node
/**
 * Regression guard for the NULL-expiry ghost-row cleanup migration (#180)
 *
 * The migration (runRefundGhostCleanup) runs at every server restart and
 * merges BIB-RFND-* ghost rows (NULL expiry, NULL source_warehouse) that
 * were created by pre-fix refund approvals into their matching non-NULL
 * expiry-dated batches.
 *
 * Scenarios:
 *   1. Ghost + matching non-NULL expiry batch present
 *      → ghost is deleted, canonical batch qty increases by ghost qty,
 *        no other rows are touched
 *   2. Orphan ghost (no matching non-NULL expiry batch)
 *      → ghost is left in place (returned as orphan count), warning logged
 *   3. Unrelated BIB rows are untouched in both scenarios
 *
 * Also tests the PATCH write_off handler (task #185):
 *   4. Write-off of a partially-sold ghost never pushes closing_qty below zero
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import { runRefundGhostCleanup } from '../api/services/refundGhostCleanup.js';

// ── Isolated fixture identifiers ───────────────────────────────────────────────
const BRANCH     = 'test_ghost_cleanup_branch';
const PRODUCT    = 'TEST_GHOST_CLEANUP_PRODUCT';
const BATCH_NO   = 'BATCH-GHOST-001';
const EXPIRY     = '2027-09-30';

// IDs with the required BIB-RFND- prefix (ghost rows)
const GHOST_ID   = 'BIB-RFND-TEST-GHOST-001';
const ORPHAN_ID  = 'BIB-RFND-TEST-ORPHAN-001';

// ID for the canonical expiry-dated batch (must NOT start with BIB-RFND-)
const CANON_ID   = 'BIB-TEST-CANON-GHOST-001';

// ID for an unrelated row that must never be touched
const UNRELATED_ID  = 'BIB-TEST-UNRELATED-GHOST-001';
const UNRELATED_QTY = 50;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function cleanup() {
  await query(`DELETE FROM branch_inventory_batches WHERE id = ANY($1)`,
    [[GHOST_ID, ORPHAN_ID, CANON_ID, UNRELATED_ID]]);
}

async function bib(id) {
  const r = await query(
    `SELECT id, quantity FROM branch_inventory_batches WHERE id = $1`, [id]
  );
  return r.rows[0] || null;
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('refund-ghost-cleanup migration', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  // ── Scenario 1: ghost merges into canonical batch ──────────────────────────

  it('merges a ghost row into the matching expiry-dated batch and deletes the ghost', async () => {
    const canonQtyBefore = 8;
    const ghostQty       = 3;

    // Canonical expiry-dated batch (the real one)
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::date,$6,'in_stock',NOW(),NOW())`,
      [CANON_ID, BRANCH, PRODUCT, BATCH_NO, EXPIRY, canonQtyBefore]
    );

    // Ghost row: id starts with BIB-RFND-, expiry_date=NULL, source_warehouse=NULL
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, source_warehouse, quantity, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,NULL,$5,'in_stock',NOW(),NOW())`,
      [GHOST_ID, BRANCH, PRODUCT, BATCH_NO, ghostQty]
    );

    // Unrelated row for the same branch — must not be touched
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
       VALUES ($1,$2,'OTHER_PRODUCT_GHOST','OTHER-BATCH',NULL,$3,'in_stock',NOW(),NOW())`,
      [UNRELATED_ID, BRANCH, UNRELATED_QTY]
    );

    const result = await runRefundGhostCleanup();

    // Cleanup reports one merged row
    expect(result.merged).toBeGreaterThanOrEqual(1);

    // Ghost is gone
    expect(await bib(GHOST_ID)).toBeNull();

    // Canonical batch gained the ghost qty
    const canon = await bib(CANON_ID);
    expect(canon).not.toBeNull();
    expect(Number(canon.quantity)).toBe(canonQtyBefore + ghostQty);

    // Unrelated row is untouched
    const unrelated = await bib(UNRELATED_ID);
    expect(unrelated).not.toBeNull();
    expect(Number(unrelated.quantity)).toBe(UNRELATED_QTY);
  });

  // ── Scenario 2: orphan ghost has no matching expiry-dated batch ────────────

  it('leaves an orphan ghost in place when no matching non-NULL expiry batch exists', async () => {
    const orphanQty = 5;

    // Orphan ghost: no canonical expiry-dated batch with matching branch/product/batch_no
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, source_warehouse, quantity, status, created_at, updated_at)
       VALUES ($1,$2,'ORPHAN_PRODUCT_GHOST','ORPHAN-BATCH-001',NULL,NULL,$3,'in_stock',NOW(),NOW())`,
      [ORPHAN_ID, BRANCH, orphanQty]
    );

    const result = await runRefundGhostCleanup();

    // At least one orphan was reported
    expect(result.orphans).toBeGreaterThanOrEqual(1);

    // Orphan row still exists with its original quantity
    const orphan = await bib(ORPHAN_ID);
    expect(orphan).not.toBeNull();
    expect(Number(orphan.quantity)).toBe(orphanQty);
  });

  // ── Scenario 3: idempotency — second run is a no-op ───────────────────────

  it('is idempotent: a second run after cleanup finds nothing to process for already-merged rows', async () => {
    // GHOST_ID was already deleted in scenario 1; run again expecting it not to appear
    const ghostAfter = await bib(GHOST_ID);
    expect(ghostAfter).toBeNull();

    // Running cleanup again should not re-add qty to the canonical batch
    const canonBefore = await bib(CANON_ID);
    await runRefundGhostCleanup();
    const canonAfter  = await bib(CANON_ID);

    if (canonBefore && canonAfter) {
      expect(Number(canonAfter.quantity)).toBe(Number(canonBefore.quantity));
    }
  });
});

// ── Write-off handler: balance non-negative guard (task #185) ─────────────────
/**
 * Exercises the PATCH write_off path in api/gm/ghost-refunds.js against a
 * ghost row whose quantity has already been partially deducted by prior sales.
 *
 * Without the balance cap added in task #185, writing off the full ghost qty
 * would push the movement-backed closing_qty below zero.  The handler now
 * caps the write-off at max(0, live_closing) so the post-write-off balance
 * is always ≥ 0.
 */
describe('ghost write-off handler — inventory_balance stays non-negative', () => {
  const WO_BRANCH   = 'test_woff_branch_185';
  const WO_PRODUCT  = 'TEST_WOFF_PRODUCT_185';
  const WO_BATCH    = 'BATCH-WOFF-185';
  const WO_GHOST_ID = 'BIB-RFND-WOFF-TEST-185';

  // IDs for the synthetic stock_movements inserted as test fixtures.
  const SM_INWARD   = 'SM-TEST-INWARD-WOFF-185';
  const SM_SALE     = 'SM-TEST-SALE-WOFF-185';

  async function woCleanup() {
    await query(
      `DELETE FROM branch_inventory_batches WHERE id = $1`,
      [WO_GHOST_ID]
    );
    await query(
      `DELETE FROM stock_movements WHERE id = ANY($1)`,
      [[SM_INWARD, SM_SALE]]
    );
    // Also remove any write-off movement the handler may have created.
    await query(
      `DELETE FROM stock_movements WHERE reference_id = $1 AND movement_type = 'write_off'`,
      [WO_GHOST_ID]
    );
    await query(
      `DELETE FROM inventory_balances WHERE location_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
      [WO_BRANCH, WO_PRODUCT]
    );
  }

  beforeAll(woCleanup);
  afterAll(woCleanup);

  it('write-off of a partially-sold ghost keeps closing_qty ≥ 0 and creates a posted write_off movement', async () => {
    // ── Fixture: ghost quantity (10) > movement-backed balance (1) ──────────
    // Real inward movement: 4 units received at branch.
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, movement_date, created_at, updated_at)
       VALUES ($1,$2,$3,4,'branch_receipt',
               'test_woff_warehouse','warehouse',
               $4,'branch',
               'REF-TEST-WOFF-185','posted',NOW(),NOW(),NOW())`,
      [SM_INWARD, WO_PRODUCT, WO_BATCH, WO_BRANCH]
    );

    // Partial sale: 3 units sold, leaving live balance = 4 - 3 = 1.
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, movement_date, created_at, updated_at)
       VALUES ($1,$2,$3,3,'walkin_sale',
               $4,'branch',
               'customer','external',
               'REF-TEST-SALE-WOFF-185','posted',NOW(),NOW(),NOW())`,
      [SM_SALE, WO_PRODUCT, WO_BATCH, WO_BRANCH]
    );

    // Ghost BIB-RFND- row: qty=10, no expiry, no source_warehouse.
    // Without the balance cap this write-off (qty=10) would produce closing=-9.
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, source_warehouse,
          quantity, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,NULL,10,'in_stock',NOW(),NOW())`,
      [WO_GHOST_ID, WO_BRANCH, WO_PRODUCT, WO_BATCH]
    );

    // ── Call the handler via a minimal mock req/res ────────────────────────
    const { default: handler } = await import('../api/gm/ghost-refunds.js');

    let responseBody;
    const mockRes = {
      _status: 200,
      status(code) { this._status = code; return this; },
      json(data)   { responseBody = data; return this; },
      end()        { return this; },
      setHeader()  { return this; },
      getHeader()  { return undefined; },
    };
    const mockReq = {
      method: 'PATCH',
      body:   { id: WO_GHOST_ID, action: 'write_off' },
      user:   { fullName: 'Test GM', role: 'gm' },
      headers: {},
    };

    await handler(mockReq, mockRes);

    // ── Handler must report success ────────────────────────────────────────
    expect(responseBody?.success).toBe(true);

    // ── Ghost BIB row must be deleted ─────────────────────────────────────
    const ghostAfter = await query(
      `SELECT id FROM branch_inventory_batches WHERE id = $1`,
      [WO_GHOST_ID]
    );
    expect(ghostAfter.rows.length).toBe(0);

    // ── A write_off stock_movement must exist with status='posted' ─────────
    const movements = await query(
      `SELECT quantity FROM stock_movements
       WHERE reference_id = $1
         AND movement_type = 'write_off'
         AND status = 'posted'`,
      [WO_GHOST_ID]
    );
    expect(movements.rows.length).toBeGreaterThanOrEqual(1);

    // ── The movement qty must not exceed the pre-write-off live balance ────
    // live balance was 1; handler should cap at 1, not write off the full 10.
    const writtenOff = movements.rows.reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(writtenOff).toBeLessThanOrEqual(1);

    // ── closing_qty in inventory_balances must be ≥ 0 after recompute ─────
    const balances = await query(
      `SELECT closing_qty FROM inventory_balances
       WHERE location_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
      [WO_BRANCH, WO_PRODUCT]
    );
    for (const row of balances.rows) {
      expect(Number(row.closing_qty)).toBeGreaterThanOrEqual(0);
    }
  });
});
