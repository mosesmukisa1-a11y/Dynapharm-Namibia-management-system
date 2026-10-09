// @vitest-environment node
/**
 * Branch-to-branch transfer receipt — destination balance increase
 *
 * Happy-path regression guard that confirms:
 *   1. Marking a branch→branch dispatched transfer as 'delivered' inserts a
 *      branch_inventory_batches row for the DESTINATION branch.
 *   2. A 'transfer_in' stock_movement is posted for the destination branch.
 *   3. After recomputeLocationBalances('branch', destBranchId) the
 *      inventory_balances row shows a positive closing_qty.
 *
 * This is the complement of the cancellation tests in
 * transfer-cancel-voids-movements.spec.js, which only verify the SOURCE
 * branch balance is restored.  A silent failure in the receipt block would
 * cause stock to silently disappear from the network during inter-branch
 * transfers.
 *
 * Also covers 'partially_received' to confirm both terminal-receipt statuses
 * apply the same inventory increase logic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock/transfers.js';
import { recomputeLocationBalances } from '../api/services/stockEngine.js';

// ── Fixture identifiers ────────────────────────────────────────────────────────
// Use a slug that does NOT contain "warehouse" so inferLocationType() classifies
// them as 'branch', triggering the branch_inventory_batches receipt path.

const TRANSFER_ID   = 'test-b2b-rcpt-transfer-001';
const SRC_BRANCH    = 'test_b2b_rcpt_src_branch';
const DST_BRANCH    = 'test_b2b_rcpt_dst_branch';
const PRODUCT       = 'TEST_B2B_RCPT_PRODUCT';
const BATCH         = 'BATCH-B2B-RCPT-001';
const EXPIRY        = '2027-06-30';
const DISPATCH_QTY  = 12;

// Partial-receipt scenario
const PARTIAL_TRANSFER_ID  = 'test-b2b-rcpt-transfer-002';
const PARTIAL_DST_BRANCH   = 'test_b2b_rcpt_dst_branch_p';
const PARTIAL_QTY          = 5;          // received less than dispatched

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildMockReqRes(method, url, body, user) {
  const captured = { status: null, body: null };

  const res = {
    setHeader: () => {},
    status(code) {
      captured.status = code;
      return {
        json(data) { captured.body = data; },
        end()      { captured.body = null; },
      };
    },
    json(data) {
      if (captured.status === null) captured.status = 200;
      captured.body = data;
    },
    end() { captured.body = null; },
  };

  const req = {
    method,
    url,
    headers: { host: 'localhost' },
    user: user || { id: 'test-admin', role: 'admin', fullName: 'Test Admin' },
    body,
  };

  return { req, res, captured };
}

async function cleanupTransfer(transferId, dstBranch) {
  await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [dstBranch]);
  await query(
    `DELETE FROM branch_inventory_batches
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [dstBranch, PRODUCT]
  );
  await query(`DELETE FROM branch_inventory_movements WHERE reference = $1`, [transferId]);
  await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [transferId]);
  await query(`DELETE FROM dispatch_notes WHERE transfer_id = $1`, [transferId]);
  await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [transferId]);
  await query(`DELETE FROM stock_transfers WHERE id = $1`, [transferId]);
}

async function cleanupAll() {
  await cleanupTransfer(TRANSFER_ID, DST_BRANCH);
  await cleanupTransfer(PARTIAL_TRANSFER_ID, PARTIAL_DST_BRANCH);
}

// ── Seed helpers ───────────────────────────────────────────────────────────────

async function seedDispatchedTransfer({ transferId, srcBranch, dstBranch, batchNo, qty }) {
  await query(
    `INSERT INTO stock_transfers
       (id, from_warehouse, to_branch, status,
        dispatched_by, dispatched_at, created_by, gm_approved_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'dispatched', 'Test Admin', NOW(), 'Test Admin', 'Test GM', NOW(), NOW())`,
    [transferId, srcBranch, dstBranch]
  );

  await query(
    `INSERT INTO stock_transfer_items
       (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved)
     VALUES ($1, $2, $2, $3, $4::date, $5, $5)`,
    [transferId, PRODUCT, batchNo, EXPIRY, qty]
  );

  // In-transit movement written at dispatch time — this is what the receipt path
  // "consumes" to finalise the transfer.
  await query(
    `INSERT INTO stock_movements
       (id, product_name, batch_no, quantity, movement_type,
        source_location, source_location_type,
        destination_location, destination_location_type,
        reference_id, status, created_at, updated_at)
     VALUES
       (gen_random_uuid()::text, $1, $2, $3, 'transfer_out',
        $4, 'branch',
        $5, 'branch',
        $6, 'posted', NOW(), NOW())`,
    [PRODUCT, batchNo, qty, srcBranch, dstBranch, transferId]
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('branch-to-branch transfer receipt — destination balance increases', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  it('inserts branch_inventory_batches row and positive balance for destination branch on "delivered"', async () => {
    await seedDispatchedTransfer({
      transferId: TRANSFER_ID,
      srcBranch: SRC_BRANCH,
      dstBranch: DST_BRANCH,
      batchNo: BATCH,
      qty: DISPATCH_QTY,
    });

    // ── Call the PATCH endpoint: branch marks transfer as delivered ────────────
    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${TRANSFER_ID}`,
      { status: 'delivered' },
      { id: 'test-branch-staff', role: 'branch', fullName: 'Branch Staff' }
    );
    req.url = `/api/stock/transfers?id=${TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // ── Assert 1: branch_inventory_batches row created for destination branch ──
    const bibRows = await query(
      `SELECT branch_id, product_name, batch_no, expiry_date, quantity
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND batch_no = $3`,
      [DST_BRANCH, PRODUCT, BATCH]
    );

    expect(bibRows.rows.length).toBeGreaterThan(0);
    expect(Number(bibRows.rows[0].quantity)).toBe(DISPATCH_QTY);
    expect(bibRows.rows[0].batch_no).toBe(BATCH);

    // ── Assert 2: transfer_in stock_movement posted for destination branch ─────
    const movRows = await query(
      `SELECT movement_type, destination_location, status, quantity
       FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_in'`,
      [TRANSFER_ID]
    );

    expect(movRows.rows.length).toBeGreaterThan(0);
    const inboundMov = movRows.rows[0];
    expect(inboundMov.status).toBe('posted');
    expect(inboundMov.destination_location).toBe(DST_BRANCH);
    expect(Number(inboundMov.quantity)).toBe(DISPATCH_QTY);

    // ── Assert 3: recomputeLocationBalances yields positive closing_qty ─────────
    // The transfer_in movement is an inward flow for the destination branch so the
    // recompute should produce closing_qty = DISPATCH_QTY.
    await recomputeLocationBalances('branch', DST_BRANCH);

    const balRows = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = 'branch'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [DST_BRANCH, PRODUCT, BATCH]
    );

    expect(balRows.rows.length).toBe(1);
    expect(Number(balRows.rows[0].inward_qty)).toBe(DISPATCH_QTY);
    expect(Number(balRows.rows[0].outward_qty)).toBe(0);
    expect(Number(balRows.rows[0].closing_qty)).toBe(DISPATCH_QTY);
  });

  it('inserts partial quantity into destination branch on "partially_received"', async () => {
    await seedDispatchedTransfer({
      transferId: PARTIAL_TRANSFER_ID,
      srcBranch: SRC_BRANCH,
      dstBranch: PARTIAL_DST_BRANCH,
      batchNo: BATCH,
      qty: DISPATCH_QTY,
    });

    // Patch the transfer item to record the partial received quantity before calling
    // the endpoint — the handler reads quantity_received from the item row.
    await query(
      `UPDATE stock_transfer_items
          SET quantity_received = $1
        WHERE transfer_id = $2`,
      [PARTIAL_QTY, PARTIAL_TRANSFER_ID]
    );

    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${PARTIAL_TRANSFER_ID}`,
      { status: 'partially_received' },
      { id: 'test-branch-staff', role: 'branch', fullName: 'Branch Staff' }
    );
    req.url = `/api/stock/transfers?id=${PARTIAL_TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // ── Assert 1: branch_inventory_batches reflects the PARTIAL quantity ───────
    const bibRows = await query(
      `SELECT quantity
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND batch_no = $3`,
      [PARTIAL_DST_BRANCH, PRODUCT, BATCH]
    );

    expect(bibRows.rows.length).toBeGreaterThan(0);
    expect(Number(bibRows.rows[0].quantity)).toBe(PARTIAL_QTY);

    // ── Assert 2: transfer_in movement quantity equals received (not dispatched) qty
    const movRows = await query(
      `SELECT quantity, status
       FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_in'`,
      [PARTIAL_TRANSFER_ID]
    );

    expect(movRows.rows.length).toBeGreaterThan(0);
    expect(Number(movRows.rows[0].quantity)).toBe(PARTIAL_QTY);
    expect(movRows.rows[0].status).toBe('posted');

    // ── Assert 3: recomputed destination balance equals partial qty ────────────
    await recomputeLocationBalances('branch', PARTIAL_DST_BRANCH);

    const balRows = await query(
      `SELECT inward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = 'branch'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [PARTIAL_DST_BRANCH, PRODUCT, BATCH]
    );

    expect(balRows.rows.length).toBe(1);
    expect(Number(balRows.rows[0].inward_qty)).toBe(PARTIAL_QTY);
    expect(Number(balRows.rows[0].closing_qty)).toBe(PARTIAL_QTY);
  });

  it('does not double-count if the same transfer is set to "delivered" a second time', async () => {
    // The isFirstReceipt guard must prevent a second receipt from adding more
    // inventory. The transfer's previousStatus will already be 'delivered' so the
    // guard must short-circuit.
    const DUPE_TRANSFER_ID = 'test-b2b-rcpt-transfer-003';
    const DUPE_DST_BRANCH  = 'test_b2b_rcpt_dst_branch_d';

    // Pre-cleanup
    await cleanupTransfer(DUPE_TRANSFER_ID, DUPE_DST_BRANCH);

    await seedDispatchedTransfer({
      transferId: DUPE_TRANSFER_ID,
      srcBranch: SRC_BRANCH,
      dstBranch: DUPE_DST_BRANCH,
      batchNo: BATCH,
      qty: DISPATCH_QTY,
    });

    // ── First receipt ──────────────────────────────────────────────────────────
    const { req: req1, res: res1, captured: c1 } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${DUPE_TRANSFER_ID}`,
      { status: 'delivered' },
      { id: 'test-branch-staff', role: 'branch', fullName: 'Branch Staff' }
    );
    req1.url = `/api/stock/transfers?id=${DUPE_TRANSFER_ID}`;
    await handler(req1, res1);
    expect(c1.status).toBe(200);

    // ── Second receipt (duplicate) ─────────────────────────────────────────────
    const { req: req2, res: res2, captured: c2 } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${DUPE_TRANSFER_ID}`,
      { status: 'delivered' },
      { id: 'test-branch-staff', role: 'branch', fullName: 'Branch Staff' }
    );
    req2.url = `/api/stock/transfers?id=${DUPE_TRANSFER_ID}`;
    await handler(req2, res2);
    // The handler returns 409 when a duplicate receipt is blocked — that is the
    // correct behaviour; we just need to confirm inventory was NOT doubled.
    expect([200, 409]).toContain(c2.status);

    // ── Assert: branch_inventory_batches qty is still DISPATCH_QTY, not doubled ─
    const bibRows = await query(
      `SELECT quantity
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND batch_no = $3`,
      [DUPE_DST_BRANCH, PRODUCT, BATCH]
    );

    expect(bibRows.rows.length).toBeGreaterThan(0);
    // Sum across all rows in case ON CONFLICT inserted multiple rows (should not)
    const totalQty = bibRows.rows.reduce((acc, r) => acc + Number(r.quantity), 0);
    expect(totalQty).toBe(DISPATCH_QTY);

    // ── Assert: recomputed balance is still DISPATCH_QTY ──────────────────────
    await recomputeLocationBalances('branch', DUPE_DST_BRANCH);

    const balRows = await query(
      `SELECT closing_qty
       FROM inventory_balances
       WHERE location_type = 'branch'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [DUPE_DST_BRANCH, PRODUCT, BATCH]
    );

    expect(balRows.rows.length).toBe(1);
    expect(Number(balRows.rows[0].closing_qty)).toBe(DISPATCH_QTY);

    // Post-test cleanup
    await cleanupTransfer(DUPE_TRANSFER_ID, DUPE_DST_BRANCH);
  });
});
