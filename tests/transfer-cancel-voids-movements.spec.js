// @vitest-environment node
/**
 * Transfer cancellation → movement voiding end-to-end test (DB-backed)
 *
 * Confirms that when a dispatched transfer is cancelled (or rejected):
 *   1. The 'transfer_out' stock_movements created at dispatch time are set to
 *      status='cancelled' — not just the 'reserved' movements from approval.
 *   2. After voiding, recomputeLocationBalances for the source warehouse
 *      correctly reflects the restored stock (the in-transit outward deduction
 *      is gone so closing_qty returns to the pre-dispatch level).
 *
 * This is the regression guard for the bug where the cancel block only voided
 * movement_type='reserved' and left 'transfer_out' rows posted, keeping the
 * warehouse balance permanently lowered even after cancellation.
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
});
