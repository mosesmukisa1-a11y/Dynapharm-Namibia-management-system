// @vitest-environment node
/**
 * Branch receipt → inventory_balances end-to-end test (DB-backed)
 *
 * Verifies that after a branch submits a "received" stock movement through the
 * full POST /api/stock-movements handler:
 *   1. inventory_balances.closing_qty for the destination branch + product
 *      immediately reflects the received quantity (the recomputeLocationBalances
 *      call is awaited before the 201 is sent).
 *   2. A second POST with the same reference_id (stock_requests row) is blocked
 *      with HTTP 409 — the duplicate receipt guard works end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock-movements.js';

// ── Isolated test fixtures ─────────────────────────────────────────────────────

const BRANCH      = 'test_receipt_balance_branch';
const PRODUCT     = 'TEST_RECEIPT_BALANCE_PRODUCT';
const BATCH       = 'BATCH-RB-001';
const REQ_ID      = 'test-receipt-balance-req-001';
const RECV_QTY    = 20;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock (req, res) pair for a POST to the stock-movements handler.
 * Returns { req, res, captured } where captured.status / captured.body are
 * filled in once the handler calls res.status(...).json(...) or res.json(...).
 */
function buildMockReqRes(body) {
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
    method: 'POST',
    headers: { host: 'localhost' },
    // Admin role → getBranchScope returns { enforced: false }
    user: { id: 'test-admin', role: 'admin', fullName: 'Test Admin' },
    body,
  };

  return { req, res, captured };
}

async function cleanup() {
  await query(
    `DELETE FROM inventory_balances
     WHERE location_type = 'branch'
       AND location_id   = $1
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [BRANCH, PRODUCT]
  );
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))`,
    [PRODUCT]
  );
  await query(
    `DELETE FROM stock_requests WHERE id = $1`,
    [REQ_ID]
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/stock-movements (received) — inventory_balances update (DB-backed)', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('returns 201 and inventory_balances.closing_qty equals the received quantity', async () => {
    const { req, res, captured } = buildMockReqRes({
      movementType:             'received',
      productName:              PRODUCT,
      batch_no:                 BATCH,
      quantity:                 RECV_QTY,
      destination_location:     BRANCH,
      destination_location_type:'branch',
      createdBy:                'test-admin',
    });

    await handler(req, res);

    // Handler must respond 201
    expect(captured.status).toBe(201);
    expect(captured.body?.success).toBe(true);

    // inventory_balances must have been updated synchronously before the 201
    const { rows } = await query(
      `SELECT inward_qty, outward_qty, closing_qty
       FROM inventory_balances
       WHERE location_type = 'branch'
         AND location_id   = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
      [BRANCH, PRODUCT]
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Sum across any batch rows (no batch filter — covers both batched and no-batch rows)
    const totalClosing = rows.reduce((s, r) => s + Number(r.closing_qty), 0);
    expect(totalClosing).toBe(RECV_QTY);
  });

  it('blocks a duplicate receipt for the same stock_requests row with 409', async () => {
    // Seed a stock_requests row in an approvable state (not yet received)
    await query(
      `INSERT INTO stock_requests (id, requesting_branch, items, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'approved', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'approved', updated_at = NOW()`,
      [REQ_ID, BRANCH, JSON.stringify([])]
    );

    const firstBody = {
      movementType:             'received',
      productName:              PRODUCT,
      batch_no:                 BATCH,
      quantity:                 5,
      destination_location:     BRANCH,
      destination_location_type:'branch',
      reference_id:             REQ_ID,
      createdBy:                'test-admin',
    };

    // First receipt — must succeed
    const first = buildMockReqRes(firstBody);
    await handler(first.req, first.res);
    expect(first.captured.status).toBe(201);

    // Second receipt with the same reference_id — must be rejected
    const second = buildMockReqRes(firstBody);
    await handler(second.req, second.res);
    expect(second.captured.status).toBe(409);
    expect(second.captured.body?.success).toBe(false);
  });
});
