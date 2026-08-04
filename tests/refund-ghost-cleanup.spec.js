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
