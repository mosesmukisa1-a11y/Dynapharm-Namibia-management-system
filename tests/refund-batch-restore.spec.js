// @vitest-environment node
/**
 * Branch refund approval — expiry batch restore regression guard
 *
 * Confirms that when a refund is approved the PATCH handler restores stock into
 * the SAME expiry-dated branch_inventory_batches row that was deducted at sale
 * time — not into a NULL-expiry row that would break FEFO ordering.
 *
 * The bug this guards against: before the fix, the UPDATE / INSERT into
 * branch_inventory_batches used a hard-coded NULL for expiry_date, so every
 * refund either created a ghost NULL-expiry row or incremented the wrong one.
 * The fix added a two-step expiry lookup:
 *   (a) from the live BIB row if the batch still has remaining stock, or
 *   (b) from stock_movements for the original sale reference if the batch was
 *       fully sold and the BIB row was deleted.
 *
 * Three scenarios tested:
 *   1. Batch still exists in BIB with remaining qty → UPDATE increments the
 *      correct row; no new NULL-expiry row is created.
 *   2. Batch was fully sold (BIB row deleted) → expiry resolved from
 *      stock_movements → INSERT uses the correct expiry_date.
 *   3. Product genuinely has no expiry (expiry_date IS NULL) → restore still
 *      works; NULL-expiry is intentional, not a bug.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../api/db.js';
import handler from '../api/stock/refund-requests.js';

// ── Isolated fixture identifiers ──────────────────────────────────────────────

const BRANCH_ID   = 'test_refund_batch_restore_branch';
const PRODUCT     = 'TEST_RFND_BATCH_RESTORE_PRODUCT';
const QTY_ON_HAND = 20;
const REFUND_QTY  = 5;
const UNIT_PRICE  = 10.00;

// ── Mock req/res builder ──────────────────────────────────────────────────────

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
    method: 'PATCH',
    url: '/api/stock/refund-requests',
    headers: { host: 'localhost' },
    user: { id: 'test-admin', role: 'admin', fullName: 'Test Admin' },
    body: { return_condition: 'saleable', ...body },
  };

  return { req, res, captured };
}

// ── Global cleanup (before + after all scenarios) ─────────────────────────────

async function cleanupAll() {
  // Remove all test-generated rows for the isolated branch/product combination.
  // Order matters: FK-dependent tables first.
  await query(
    `DELETE FROM branch_refund_requests
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [BRANCH_ID, PRODUCT]
  );
  await query(
    `DELETE FROM branch_inventory_batches
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [BRANCH_ID, PRODUCT]
  );
  await query(
    `DELETE FROM branch_inventory_movements
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
    [BRANCH_ID, PRODUCT]
  );
  await query(
    `DELETE FROM branch_activity_transactions
     WHERE branch_id = $1`,
    [BRANCH_ID]
  );
  // stock_movements seeded by scenario 2 (original sale) and by the handler
  await query(
    `DELETE FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
       AND (source_location = $2 OR destination_location = $2)`,
    [PRODUCT, BRANCH_ID]
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('branch refund approval — restores stock to the correct expiry batch', () => {
  beforeAll(cleanupAll);
  afterAll(cleanupAll);

  // ── Scenario 1 ────────────────────────────────────────────────────────────
  // The batch still exists in branch_inventory_batches with remaining stock.
  // The handler should resolve expiry from the live BIB row and UPDATE it —
  // incrementing the existing expiry-dated row, not creating a NULL-expiry one.
  it('increments the existing expiry-dated BIB row instead of creating a NULL-expiry row', async () => {
    const REFUND_ID  = 'test-rfnd-restore-scen1-001';
    const BATCH_NO   = 'BATCH-RFND-SCEN1-001';
    const EXPIRY     = '2027-06-30';

    // Pre-test cleanup
    await query(`DELETE FROM branch_refund_requests WHERE id = $1`, [REFUND_ID]);
    await query(
      `DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND batch_no = $2`,
      [BRANCH_ID, BATCH_NO]
    );

    // Seed: live BIB row with a real expiry date
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price,
          source_warehouse, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::date,$6,$7,NULL,'in_stock',NOW(),NOW())`,
      ['BIB-RFND-S1-001', BRANCH_ID, PRODUCT, BATCH_NO, EXPIRY, QTY_ON_HAND, UNIT_PRICE]
    );

    // Seed: pending refund request referencing that batch
    await query(
      `INSERT INTO branch_refund_requests
         (id, branch_id, product_name, batch_no, quantity, unit_price,
          refund_amount, reason, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'damaged goods','pending',NOW())`,
      [REFUND_ID, BRANCH_ID, PRODUCT, BATCH_NO,
       REFUND_QTY, UNIT_PRICE, REFUND_QTY * UNIT_PRICE]
    );

    // Approve via the real handler
    const { req, res, captured } = buildMockReqRes({
      id: REFUND_ID,
      action: 'approve',
      approved_by: 'Test Admin',
    });
    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // Assert: the existing BIB row was updated (20 + 5 = 25), no new row
    const bibRows = await query(
      `SELECT quantity, expiry_date, batch_no
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))`,
      [BRANCH_ID, PRODUCT]
    );

    // Exactly one BIB row — no ghost NULL-expiry duplicate was created
    expect(bibRows.rows.length).toBe(1);
    expect(Number(bibRows.rows[0].quantity)).toBe(QTY_ON_HAND + REFUND_QTY);

    // Expiry is preserved — the correct dated row was updated
    const storedExpiry = bibRows.rows[0].expiry_date;
    expect(storedExpiry).not.toBeNull();
    const storedDate = storedExpiry instanceof Date
      ? storedExpiry.toISOString().slice(0, 10)
      : String(storedExpiry).slice(0, 10);
    expect(storedDate).toBe(EXPIRY);

    // Verify the refund request is marked approved
    const refundRow = await query(
      `SELECT status FROM branch_refund_requests WHERE id = $1`,
      [REFUND_ID]
    );
    expect(refundRow.rows[0]?.status).toBe('approved');
  });

  // ── Scenario 2 ────────────────────────────────────────────────────────────
  // The batch was fully sold — the BIB row was deleted.
  // The handler must fall back to stock_movements for the original sale
  // reference to recover the expiry_date, then INSERT a new BIB row using it.
  it('inserts a new BIB row with expiry resolved from stock_movements when the original batch row is gone', async () => {
    const REFUND_ID  = 'test-rfnd-restore-scen2-001';
    const SALE_REF   = 'SALE-REF-RFND-SCEN2-001';
    const BATCH_NO   = 'BATCH-RFND-SCEN2-001';
    const EXPIRY     = '2027-09-15';

    // Pre-test cleanup
    await query(`DELETE FROM branch_refund_requests WHERE id = $1`, [REFUND_ID]);
    await query(
      `DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND batch_no = $2`,
      [BRANCH_ID, BATCH_NO]
    );
    await query(`DELETE FROM stock_movements WHERE reference_id = $1`, [SALE_REF]);

    // No BIB row — the batch was fully sold.
    // Seed a stock_movements row representing the original sale (branch_sale).
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, expiry_date, quantity, movement_type,
          source_location, source_location_type,
          destination_location, destination_location_type,
          reference_id, notes, created_by, status,
          movement_date, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text,$1,$2,$3::date,$4,'branch_sale',
          $5,'branch','customer','external',
          $6,'original sale','Test Admin','posted',NOW(),NOW(),NOW())`,
      [PRODUCT, BATCH_NO, EXPIRY, REFUND_QTY, BRANCH_ID, SALE_REF]
    );

    // Seed: pending refund request with a sale_reference pointing at the movement
    await query(
      `INSERT INTO branch_refund_requests
         (id, branch_id, product_name, batch_no, quantity, unit_price,
          refund_amount, reason, status, sale_reference, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'changed mind','pending',$8,NOW())`,
      [REFUND_ID, BRANCH_ID, PRODUCT, BATCH_NO,
       REFUND_QTY, UNIT_PRICE, REFUND_QTY * UNIT_PRICE, SALE_REF]
    );

    // Approve via the real handler
    const { req, res, captured } = buildMockReqRes({
      id: REFUND_ID,
      action: 'approve',
      approved_by: 'Test Admin',
    });
    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // Assert: a new BIB row was inserted with the correct expiry (not NULL)
    const bibRows = await query(
      `SELECT quantity, expiry_date
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND batch_no = $3`,
      [BRANCH_ID, PRODUCT, BATCH_NO]
    );

    expect(bibRows.rows.length).toBe(1);
    expect(Number(bibRows.rows[0].quantity)).toBe(REFUND_QTY);

    // The expiry must come from the stock_movements row, not be NULL
    const storedExpiry = bibRows.rows[0].expiry_date;
    expect(storedExpiry).not.toBeNull();
    const storedDate = storedExpiry instanceof Date
      ? storedExpiry.toISOString().slice(0, 10)
      : String(storedExpiry).slice(0, 10);
    expect(storedDate).toBe(EXPIRY);
  });

  // ── Scenario 3 ────────────────────────────────────────────────────────────
  // The product legitimately has no expiry (expiry_date IS NULL).
  // NULL-expiry is the correct state here — the restore must still work and
  // must not be confused with the old NULL-expiry bug.
  it('restores stock correctly when the product has no expiry (NULL is intentional)', async () => {
    const REFUND_ID  = 'test-rfnd-restore-scen3-001';
    const BATCH_NO   = 'BATCH-RFND-SCEN3-001';

    // Pre-test cleanup
    await query(`DELETE FROM branch_refund_requests WHERE id = $1`, [REFUND_ID]);
    await query(
      `DELETE FROM branch_inventory_batches WHERE branch_id = $1 AND batch_no = $2`,
      [BRANCH_ID, BATCH_NO]
    );

    // Seed: BIB row with NULL expiry (intentional — no-expiry product)
    await query(
      `INSERT INTO branch_inventory_batches
         (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price,
          source_warehouse, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NULL,$5,$6,NULL,'in_stock',NOW(),NOW())`,
      ['BIB-RFND-S3-001', BRANCH_ID, PRODUCT, BATCH_NO, QTY_ON_HAND, UNIT_PRICE]
    );

    // Seed: pending refund — no sale_reference so stock_movements fallback is skipped
    await query(
      `INSERT INTO branch_refund_requests
         (id, branch_id, product_name, batch_no, quantity, unit_price,
          refund_amount, reason, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'returned unused','pending',NOW())`,
      [REFUND_ID, BRANCH_ID, PRODUCT, BATCH_NO,
       REFUND_QTY, UNIT_PRICE, REFUND_QTY * UNIT_PRICE]
    );

    // Approve via the real handler
    const { req, res, captured } = buildMockReqRes({
      id: REFUND_ID,
      action: 'approve',
      approved_by: 'Test Admin',
    });
    await handler(req, res);

    expect(captured.status).toBe(200);
    expect(captured.body?.success).toBe(true);

    // Assert: the NULL-expiry BIB row was updated (20 + 5 = 25), still NULL expiry
    const bibRows = await query(
      `SELECT quantity, expiry_date
       FROM branch_inventory_batches
       WHERE branch_id = $1
         AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
         AND batch_no = $3`,
      [BRANCH_ID, PRODUCT, BATCH_NO]
    );

    // Exactly one row (no duplicate was created)
    expect(bibRows.rows.length).toBe(1);
    expect(Number(bibRows.rows[0].quantity)).toBe(QTY_ON_HAND + REFUND_QTY);

    // Expiry remains NULL — as intended for a no-expiry product
    expect(bibRows.rows[0].expiry_date).toBeNull();
  });
});
