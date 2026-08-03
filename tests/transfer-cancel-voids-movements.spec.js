// @vitest-environment node
/**
 * Transfer cancellation → movement voiding end-to-end test (DB-backed)
 *
 * Confirms that when a dispatched transfer is cancelled (or rejected):
 *   1. The 'transfer_out' stock_movements created at dispatch time are set to
 *      status='cancelled' — not just the 'reserved' movements from approval.
 *   2. After voiding, recomputeLocationBalances for the source warehouse/branch
 *      correctly reflects the restored stock (the in-transit outward deduction
 *      is gone so closing_qty returns to the pre-dispatch level).
 *
 * This is the regression guard for the bug where the cancel block only voided
 * movement_type='reserved' and left 'transfer_out' rows posted, keeping the
 * warehouse balance permanently lowered even after cancellation.
 *
 * Also covers branch-to-branch transfers: when from_warehouse is a branch slug
 * inferLocationType() returns 'branch', so the cancel block restores
 * branch_inventory_batches instead of stock_batches. The transfer_out movement
 * voiding and recomputeLocationBalances('branch', ...) call must still work so
 * the source branch balance is correctly zeroed after cancellation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock/transfers.js';
import { recomputeLocationBalances } from '../api/services/stockEngine.js';

// ── Isolated test fixtures ─────────────────────────────────────────────────────

const TRANSFER_ID   = 'test-cancel-void-transfer-001';
const WAREHOUSE_ID  = 'test_cancel_void_warehouse';
const BRANCH_ID     = 'test_cancel_void_branch';
const PRODUCT       = 'TEST_CANCEL_VOID_PRODUCT';
const BATCH         = 'BATCH-CANCEL-VOID-001';
const DISPATCH_QTY  = 10;

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

async function cleanup() {
  await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [WAREHOUSE_ID]);
  await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [TRANSFER_ID]);
  await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [TRANSFER_ID]);
  await query(`DELETE FROM dispatch_notes WHERE transfer_id = $1`, [TRANSFER_ID]);
  await query(`DELETE FROM stock_transfers WHERE id = $1`, [TRANSFER_ID]);
  // Clean up stock_batches test rows
  await query(
    `DELETE FROM stock_batches
     WHERE location = $1 AND LOWER(TRIM(description)) = LOWER(TRIM($2))`,
    [WAREHOUSE_ID, PRODUCT]
  );
  // Clean up warehouse_inventory test rows
  await query(
    `DELETE FROM warehouse_inventory
     WHERE warehouse_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [WAREHOUSE_ID, PRODUCT]
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transfer cancellation — voids in-transit movements so balance resets', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('sets transfer_out movements to cancelled and restores warehouse balance', async () => {
    // ── Seed the transfer in dispatched state ──────────────────────────────────
    await query(
      `INSERT INTO stock_transfers (id, from_warehouse, to_branch, status, dispatched_by, dispatched_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'dispatched', 'Test Admin', NOW(), 'Test Admin', NOW(), NOW())`,
      [TRANSFER_ID, WAREHOUSE_ID, BRANCH_ID]
    );

    await query(
      `INSERT INTO stock_transfer_items (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved)
       VALUES ($1, $2, $2, $3, NULL, $4, $4)`,
      [TRANSFER_ID, PRODUCT, BATCH, DISPATCH_QTY]
    );

    // ── Seed stock_batches to represent warehouse stock that was dispatched ────
    // dispatched_quantity = DISPATCH_QTY means the stock is reserved/dispatched.
    // remaining_quantity = 0 because FEFO deduction already happened at dispatch.
    await query(
      `INSERT INTO stock_batches (id, location, warehouse_id, description, batch_no, quantity, remaining_quantity, dispatched_quantity, status, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $1, $2, $3, $4, 0, $4, 'active', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [WAREHOUSE_ID, PRODUCT, BATCH, DISPATCH_QTY]
    );

    // ── Seed the two movement types created during the approve→dispatch flow ──
    // 'reserved' movement written at approval time
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, 'reserved',
          $4, 'warehouse',
          $5, 'branch',
          $6, 'posted', NOW(), NOW())`,
      [PRODUCT, BATCH, DISPATCH_QTY, WAREHOUSE_ID, BRANCH_ID, TRANSFER_ID]
    );

    // 'transfer_out' movement written at dispatch time — this is the in-transit row
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, 'transfer_out',
          $4, 'warehouse',
          $5, 'branch',
          $6, 'posted', NOW(), NOW())`,
      [PRODUCT, BATCH, DISPATCH_QTY, WAREHOUSE_ID, BRANCH_ID, TRANSFER_ID]
    );

    // ── Also seed an inventory_balance to represent the pre-cancel state ───────
    // This simulates the OUTWARD deduction that already happened when stock left.
    // recompute after cancel should zero/restore this.
    await query(
      `DELETE FROM inventory_balances
       WHERE location_type = 'warehouse' AND location_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [WAREHOUSE_ID, PRODUCT, BATCH]
    );
    await query(
      `INSERT INTO inventory_balances
         (id, location_type, location_id, product_name, batch_no,
          inward_qty, outward_qty, closing_qty, updated_at)
       VALUES
         (gen_random_uuid()::text, 'warehouse', $1, $2, $3,
          $4, $4, 0, NOW())`,
      [WAREHOUSE_ID, PRODUCT, BATCH, DISPATCH_QTY]
    );

    // ── Call the PATCH endpoint to cancel the dispatched transfer ──────────────
    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${TRANSFER_ID}`,
      { status: 'cancelled' },
      { id: 'test-admin', role: 'admin', fullName: 'Test Admin' }
    );
    req.url = `/api/stock/transfers?id=${TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // ── Assert 1: transfer_out movements are now cancelled ────────────────────
    const transitMovements = await query(
      `SELECT status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_out'`,
      [TRANSFER_ID]
    );
    expect(transitMovements.rows.length).toBeGreaterThan(0);
    for (const row of transitMovements.rows) {
      expect(row.status).toBe('cancelled');
    }

    // ── Assert 2: reserved movements are also cancelled ───────────────────────
    const reservedMovements = await query(
      `SELECT status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'reserved'`,
      [TRANSFER_ID]
    );
    expect(reservedMovements.rows.length).toBeGreaterThan(0);
    for (const row of reservedMovements.rows) {
      expect(row.status).toBe('cancelled');
    }

    // ── Assert 3: recomputeLocationBalances returns closing_qty = 0 ───────────
    // All movements for this transfer+warehouse are now cancelled, so the
    // recompute should find no posted outward movements and produce closing = 0.
    await recomputeLocationBalances('warehouse', WAREHOUSE_ID);

    const balanceRows = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = 'warehouse'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [WAREHOUSE_ID, PRODUCT, BATCH]
    );

    // After all movements are voided, the balance must be zero across the board.
    expect(balanceRows.rows.length).toBe(1);
    expect(Number(balanceRows.rows[0].inward_qty)).toBe(0);
    expect(Number(balanceRows.rows[0].outward_qty)).toBe(0);
    expect(Number(balanceRows.rows[0].closing_qty)).toBe(0);
  });

  it('also voids transfer_out movements when a dispatched transfer is rejected', async () => {
    const REJECT_TRANSFER_ID = 'test-cancel-void-transfer-002';
    const REJECT_WAREHOUSE   = 'test_cancel_void_warehouse_rej';

    await query(
      `DELETE FROM stock_movements WHERE reference_id = $1`, [REJECT_TRANSFER_ID]
    );
    await query(
      `DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [REJECT_TRANSFER_ID]
    );
    await query(
      `DELETE FROM stock_transfers WHERE id = $1`, [REJECT_TRANSFER_ID]
    );

    // Seed a dispatched transfer that will be rejected
    await query(
      `INSERT INTO stock_transfers (id, from_warehouse, to_branch, status, dispatched_by, dispatched_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'dispatched', 'Test Admin', NOW(), 'Test Admin', NOW(), NOW())`,
      [REJECT_TRANSFER_ID, REJECT_WAREHOUSE, BRANCH_ID]
    );
    await query(
      `INSERT INTO stock_transfer_items (transfer_id, product_id, product_name, batch_no, quantity, quantity_approved)
       VALUES ($1, $2, $2, $3, $4, $4)`,
      [REJECT_TRANSFER_ID, PRODUCT, BATCH, DISPATCH_QTY]
    );

    // Seed a transfer_out movement (in-transit)
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, 'transfer_out',
          $4, 'warehouse',
          $5, 'branch',
          $6, 'posted', NOW(), NOW())`,
      [PRODUCT, BATCH, DISPATCH_QTY, REJECT_WAREHOUSE, BRANCH_ID, REJECT_TRANSFER_ID]
    );

    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${REJECT_TRANSFER_ID}`,
      { status: 'rejected', rejection_reason: 'Test rejection' },
      { id: 'test-admin', role: 'admin', fullName: 'Test Admin' }
    );
    req.url = `/api/stock/transfers?id=${REJECT_TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    const rows = await query(
      `SELECT status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_out'`,
      [REJECT_TRANSFER_ID]
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.status).toBe('cancelled');
    }

    // Cleanup reject test data
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [REJECT_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [REJECT_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfers WHERE id = $1`, [REJECT_TRANSFER_ID]);
  });

  it('voids transfer_out movements and resets source branch balance for branch-to-branch cancellation', async () => {
    // ── Fixture identifiers ────────────────────────────────────────────────────
    // The source is a branch slug (no "warehouse" in the name) so that
    // inferLocationType() returns 'branch' and the cancel block takes the
    // branch_inventory_batches restore path instead of the stock_batches path.
    const B2B_TRANSFER_ID = 'test-cancel-void-b2b-transfer-001';
    const SRC_BRANCH      = 'test_cancel_void_src_branch';
    const DST_BRANCH      = 'test_cancel_void_dst_branch';
    const B2B_PRODUCT     = 'TEST_CANCEL_VOID_B2B_PRODUCT';
    const B2B_BATCH       = 'BATCH-CANCEL-VOID-B2B-001';
    const B2B_EXPIRY      = '2027-12-31';
    const B2B_QTY         = 8;

    // ── Pre-test cleanup ───────────────────────────────────────────────────────
    await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [SRC_BRANCH]);
    await query(`DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`, [SRC_BRANCH, B2B_PRODUCT]);
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [B2B_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [B2B_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfers WHERE id = $1`, [B2B_TRANSFER_ID]);

    // ── Seed the branch-to-branch transfer in 'dispatched' state ──────────────
    // Branch-to-branch transfers use from_warehouse = source branch slug.
    // inferLocationType(SRC_BRANCH) → 'branch' (no "warehouse" substring),
    // so the cancel block will restore branch_inventory_batches.
    await query(
      `INSERT INTO stock_transfers
         (id, from_warehouse, to_branch, status, dispatched_by, dispatched_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'dispatched', 'Test Admin', NOW(), 'Test Admin', NOW(), NOW())`,
      [B2B_TRANSFER_ID, SRC_BRANCH, DST_BRANCH]
    );

    // Transfer item — expiry_date is required for the branch_inventory_batches
    // restore path (the cancel block guards on batchNo && expiryDate).
    await query(
      `INSERT INTO stock_transfer_items
         (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved)
       VALUES ($1, $2, $2, $3, $4::date, $5, $5)`,
      [B2B_TRANSFER_ID, B2B_PRODUCT, B2B_BATCH, B2B_EXPIRY, B2B_QTY]
    );

    // ── Seed the inventory_balance for the source branch ──────────────────────
    // Simulates the state after dispatch: an outward deduction of B2B_QTY exists
    // so closing_qty = 0.  After cancellation the recompute should still yield
    // closing_qty = 0 (no posted movements remain for this location+product).
    await query(
      `INSERT INTO inventory_balances
         (id, location_type, location_id, product_name, batch_no,
          inward_qty, outward_qty, closing_qty, updated_at)
       VALUES
         (gen_random_uuid()::text, 'branch', $1, $2, $3,
          $4, $4, 0, NOW())
       ON CONFLICT DO NOTHING`,
      [SRC_BRANCH, B2B_PRODUCT, B2B_BATCH, B2B_QTY]
    );

    // ── Seed the transfer_out movement written at dispatch time ───────────────
    // source_location_type='branch' mirrors how the dispatch block records it
    // for branch-sourced transfers.
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
      [B2B_PRODUCT, B2B_BATCH, B2B_QTY, SRC_BRANCH, DST_BRANCH, B2B_TRANSFER_ID]
    );

    // ── Call the PATCH endpoint to cancel the dispatched transfer ──────────────
    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${B2B_TRANSFER_ID}`,
      { status: 'cancelled' },
      { id: 'test-admin', role: 'admin', fullName: 'Test Admin' }
    );
    req.url = `/api/stock/transfers?id=${B2B_TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // ── Assert 1: transfer_out movements are now cancelled ────────────────────
    const transitMovements = await query(
      `SELECT status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_out'`,
      [B2B_TRANSFER_ID]
    );
    expect(transitMovements.rows.length).toBeGreaterThan(0);
    for (const row of transitMovements.rows) {
      expect(row.status).toBe('cancelled');
    }

    // ── Assert 2: recomputeLocationBalances returns closing_qty = 0 ───────────
    // All transfer_out movements are now cancelled; no posted outward movements
    // remain for this source branch + product combination, so the recomputed
    // balance must show zero across inward, outward, and closing.
    await recomputeLocationBalances('branch', SRC_BRANCH);

    const balanceRows = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = 'branch'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3`,
      [SRC_BRANCH, B2B_PRODUCT, B2B_BATCH]
    );

    // With no posted movements the balance row should be absent or all-zero.
    // recomputeLocationBalances deletes rows that compute to zero so either
    // outcome (0 rows or 1 all-zero row) confirms the outward deduction is gone.
    if (balanceRows.rows.length > 0) {
      expect(Number(balanceRows.rows[0].inward_qty)).toBe(0);
      expect(Number(balanceRows.rows[0].outward_qty)).toBe(0);
      expect(Number(balanceRows.rows[0].closing_qty)).toBe(0);
    } else {
      // Row was pruned because it was all-zero — balance is correctly zeroed.
      expect(balanceRows.rows.length).toBe(0);
    }

    // ── Post-test cleanup ──────────────────────────────────────────────────────
    await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [SRC_BRANCH]);
    await query(`DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`, [SRC_BRANCH, B2B_PRODUCT]);
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [B2B_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [B2B_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfers WHERE id = $1`, [B2B_TRANSFER_ID]);
  });

  it('voids both reserved and transfer_out movements for branch-to-branch cancellation', async () => {
    // ── What this test covers ──────────────────────────────────────────────────
    // Branch-to-branch transfers that went through GM approval produce TWO
    // movement types that must both be voided on cancellation:
    //
    //   • 'reserved'     — written at approval time to soft-lock stock
    //   • 'transfer_out' — written at dispatch time for the physical movement
    //
    // The cancel block in transfers.js voids both via separate UPDATE statements
    // (lines ~1397-1413).  This test seeds both movement types and confirms that
    // neither is left 'posted' after cancellation — leaving either posted would
    // cause the source branch balance to appear lower than it really is.

    const B2B2_TRANSFER_ID = 'test-cancel-void-b2b-reserved-001';
    const SRC_BRANCH2      = 'test_cancel_src_branch_2';
    const DST_BRANCH2      = 'test_cancel_dst_branch_2';
    const B2B2_PRODUCT     = 'TEST_CANCEL_B2B_RESERVED_PRODUCT';
    const B2B2_BATCH       = 'BATCH-CANCEL-B2B-RSV-001';
    const B2B2_EXPIRY      = '2027-06-30';
    const B2B2_QTY         = 12;

    // ── Pre-test cleanup ───────────────────────────────────────────────────────
    await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [SRC_BRANCH2]);
    await query(`DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`, [SRC_BRANCH2, B2B2_PRODUCT]);
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [B2B2_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [B2B2_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfers WHERE id = $1`, [B2B2_TRANSFER_ID]);

    // ── Seed the branch-to-branch transfer (dispatched state) ─────────────────
    // previousStatus='dispatched' satisfies the cancel-block guard that requires
    // previousStatus === 'approved' || previousStatus === 'dispatched'.
    await query(
      `INSERT INTO stock_transfers
         (id, from_warehouse, to_branch, status, dispatched_by, dispatched_at, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'dispatched', 'Test Admin', NOW(), 'Test Admin', NOW(), NOW())`,
      [B2B2_TRANSFER_ID, SRC_BRANCH2, DST_BRANCH2]
    );

    // Transfer item — expiry_date is required for the branch_inventory_batches
    // restore path (cancel block guards on batchNo && expiryDate).
    await query(
      `INSERT INTO stock_transfer_items
         (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved)
       VALUES ($1, $2, $2, $3, $4::date, $5, $5)`,
      [B2B2_TRANSFER_ID, B2B2_PRODUCT, B2B2_BATCH, B2B2_EXPIRY, B2B2_QTY]
    );

    // ── Seed 'reserved' movement — written at approval time ───────────────────
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, status, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, 'reserved',
          $4, 'branch',
          $5, 'branch',
          $6, 'posted', NOW(), NOW())`,
      [B2B2_PRODUCT, B2B2_BATCH, B2B2_QTY, SRC_BRANCH2, DST_BRANCH2, B2B2_TRANSFER_ID]
    );

    // ── Seed 'transfer_out' movement — written at dispatch time ───────────────
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
      [B2B2_PRODUCT, B2B2_BATCH, B2B2_QTY, SRC_BRANCH2, DST_BRANCH2, B2B2_TRANSFER_ID]
    );

    // ── Cancel via the real PATCH handler ──────────────────────────────────────
    const { req, res, captured } = buildMockReqRes(
      'PATCH',
      `/api/stock/transfers?id=${B2B2_TRANSFER_ID}`,
      { status: 'cancelled' },
      { id: 'test-admin', role: 'admin', fullName: 'Test Admin' }
    );
    req.url = `/api/stock/transfers?id=${B2B2_TRANSFER_ID}`;

    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // ── Assert: reserved movements are voided ─────────────────────────────────
    const reservedRows = await query(
      `SELECT movement_type, status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'reserved'`,
      [B2B2_TRANSFER_ID]
    );
    expect(reservedRows.rows.length).toBeGreaterThan(0);
    for (const row of reservedRows.rows) {
      expect(row.status).toBe('cancelled');
    }

    // ── Assert: transfer_out movements are voided ─────────────────────────────
    const transitRows = await query(
      `SELECT movement_type, status FROM stock_movements
       WHERE reference_id = $1 AND movement_type = 'transfer_out'`,
      [B2B2_TRANSFER_ID]
    );
    expect(transitRows.rows.length).toBeGreaterThan(0);
    for (const row of transitRows.rows) {
      expect(row.status).toBe('cancelled');
    }

    // ── Assert: no posted movements remain for this transfer ──────────────────
    const postedRows = await query(
      `SELECT id FROM stock_movements
       WHERE reference_id = $1 AND status = 'posted'`,
      [B2B2_TRANSFER_ID]
    );
    expect(postedRows.rows.length).toBe(0);

    // ── Post-test cleanup ──────────────────────────────────────────────────────
    await query(`DELETE FROM inventory_balances WHERE location_id = $1`, [SRC_BRANCH2]);
    await query(`DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`, [SRC_BRANCH2, B2B2_PRODUCT]);
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [B2B2_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfer_items WHERE transfer_id = $1`, [B2B2_TRANSFER_ID]);
    await query(`DELETE FROM stock_transfers WHERE id = $1`, [B2B2_TRANSFER_ID]);
  });
});
