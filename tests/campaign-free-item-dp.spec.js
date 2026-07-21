// @vitest-environment node
/**
 * Integration test: campaign free-item DP guard (monthly branch-sales report)
 *
 * This test inserts REAL rows into branch_inventory_movements and product_prices
 * and calls the handler against the live database, proving the SQL CASE guard and
 * the JS accumulator guard both work correctly end-to-end.
 *
 * Scenario
 * --------
 * Campaign reference TEST-CAMP-FREE-ITEM-DP-001, branch: test_branch_camp
 *   • Paid product  — "TestProdPaid_CampFree"  : 2 × N$50 DP (campaign_sale)
 *   • Free product  — "TestProdFree_CampFree"  : 1 × N$30 DP, unit_price = 30
 *                     stored in DB as campaign_free_item (non-zero unit_price!)
 *
 * Expected results
 * ----------------
 *   campaign_sales.value = 100   (paid items only — N$130 would indicate a guard failure)
 *   grand_total          = 100
 *   free product entry   : is_free=true, dp_value=0
 *   paid product entry   : qty=2, dp_value=100
 *
 * Three guard layers proven
 * -------------------------
 *   1. SQL  CASE WHEN type='campaign_free_item' THEN 0  (runs during real DB query)
 *   2. JS   if (!isFree) campaignRefAgg[ref].total_dp += …
 *   3. JS   synthetic row grand_total sourced from the already-correct aggregate
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import handler from '../api/reports/branch-sales/monthly.js';

// ─── DB pool ──────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
});

// ─── Test constants ───────────────────────────────────────────────────────────

const BRANCH      = 'test_branch_camp';
const REFERENCE   = 'TEST-CAMP-FREE-ITEM-DP-001';
const MONTH       = '2025-06';
const DATE_IN     = '2025-06-15T10:00:00Z';

const PAID_PRODUCT = 'TestProdPaid_CampFree';
const FREE_PRODUCT = 'TestProdFree_CampFree';
const PAID_DP      = 50;   // N$50 per unit × qty 2 = N$100
const FREE_DP      = 30;   // N$30 list price — must NOT appear in totals

// ─── Seed & teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure product_prices rows exist (use INSERT … ON CONFLICT DO UPDATE
    // so we don't fail if the names already exist from a previous run).
    await client.query(`
      INSERT INTO product_prices (description, dp, cp, cif, bv)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (description) DO UPDATE
        SET dp = EXCLUDED.dp, cp = EXCLUDED.cp
    `, [PAID_PRODUCT, PAID_DP, PAID_DP * 1.3, PAID_DP * 0.8, PAID_DP * 0.1]);

    await client.query(`
      INSERT INTO product_prices (description, dp, cp, cif, bv)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (description) DO UPDATE
        SET dp = EXCLUDED.dp, cp = EXCLUDED.cp
    `, [FREE_PRODUCT, FREE_DP, FREE_DP * 1.3, FREE_DP * 0.8, FREE_DP * 0.1]);

    // Delete any pre-existing movements for this reference (idempotent re-runs)
    await client.query(
      `DELETE FROM branch_inventory_movements WHERE reference = $1`,
      [REFERENCE]
    );

    // Insert paid campaign movement: 2 × N$50, type = campaign_sale
    await client.query(`
      INSERT INTO branch_inventory_movements
        (id, branch_id, type, product_name, batch_no, quantity, reference, unit_price, created_at)
      VALUES ($1, $2, 'campaign_sale', $3, 'TBATCH01', -2, $4, $5, $6)
    `, [
      `test-camp-paid-${Date.now()}`,
      BRANCH, PAID_PRODUCT, REFERENCE, PAID_DP, DATE_IN,
    ]);

    // Insert free campaign movement: 1 × N$30 list DP but unit_price = 30 (non-zero!)
    // The SQL CASE guard must zero this out; if it doesn't, total would be N$130.
    await client.query(`
      INSERT INTO branch_inventory_movements
        (id, branch_id, type, product_name, batch_no, quantity, reference, unit_price, created_at)
      VALUES ($1, $2, 'campaign_free_item', $3, 'TBATCH02', -1, $4, $5, $6)
    `, [
      `test-camp-free-${Date.now()}`,
      BRANCH, FREE_PRODUCT, REFERENCE, FREE_DP /* non-zero — the dangerous value */, DATE_IN,
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM branch_inventory_movements WHERE reference = $1`,
      [REFERENCE]
    );
    await client.query(
      `DELETE FROM product_prices WHERE description IN ($1, $2)`,
      [PAID_PRODUCT, FREE_PRODUCT]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cleanup failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
});

// ─── Request / response helpers ───────────────────────────────────────────────

function buildMockReq() {
  return {
    method: 'GET',
    headers: { host: 'localhost' },
    url: `/api/reports/branch-sales/monthly?branch_id=${BRANCH}&month=${MONTH}`,
  };
}

function buildMockRes() {
  const res = { _status: 200, _body: null, headersSent: false };
  res.status    = (code) => { res._status = code; return res; };
  res.json      = (body) => { res._body = body; res.headersSent = true; return res; };
  res.end       = () => res;
  res.setHeader = () => res;
  return res;
}

async function runHandler() {
  const req = buildMockReq();
  const res = buildMockRes();
  await handler(req, res);
  return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('monthly branch-sales report — campaign free-item DP guard (DB-backed)', () => {

  it('handler returns HTTP 200 with success=true', async () => {
    const res = await runHandler();
    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
  });

  /**
   * Layer 1 (SQL CASE WHEN type='campaign_free_item' THEN 0) +
   * Layer 3 (synthetic row sourced from correct aggregate):
   * N$100 (paid only) not N$130 (paid + free).
   */
  it('campaign_sales.value = N$100 — free item with unit_price=30 is NOT counted', async () => {
    const res = await runHandler();
    expect(res._body.campaign_sales.value).toBe(100);
  });

  /**
   * Layer 3 cross-check: grand_total must also be N$100.
   */
  it('grand_total = N$100 (no other sales in test branch/month)', async () => {
    const res = await runHandler();
    expect(res._body.grand_total).toBe(100);
  });

  /**
   * Layer 1 product detail: the free product entry carries is_free=true and dp_value=0.
   */
  it('free product in campaign line_items has is_free=true and dp_value=0', async () => {
    const res = await runHandler();
    const lineItems = res._body.campaign_sales.line_items;
    expect(lineItems).toHaveLength(1);

    const freeEntry = lineItems[0].products.find(
      p => p.product_name.toLowerCase() === FREE_PRODUCT.toLowerCase()
    );
    expect(freeEntry).toBeDefined();
    expect(freeEntry.is_free).toBe(true);
    expect(freeEntry.dp_value).toBe(0);
  });

  /**
   * Paid product sanity check: correct qty and dp_value in the detail list.
   */
  it('paid product in campaign line_items has qty=2 and dp_value=N$100', async () => {
    const res = await runHandler();
    const products = res._body.campaign_sales.line_items[0].products;
    const paidEntry = products.find(
      p => p.product_name.toLowerCase() === PAID_PRODUCT.toLowerCase()
    );
    expect(paidEntry).toBeDefined();
    expect(paidEntry.qty).toBe(2);
    expect(paidEntry.dp_value).toBe(100);
    expect(paidEntry.is_free).toBe(false);
  });

});
