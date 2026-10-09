// @vitest-environment node

/**
 * Dispatch note cancellation and controlled-reversal regression tests.
 *
 * Calls the real PATCH handler from api/stock/transfers.js (not a local copy)
 * Pre-dispatch cancellation/rejection releases reservations and cleans up any
 * stale in-transit note. Once dispatched, both actions must return 409 without
 * changing stock, movements, transfer lines, or notes. Finance/GM visibility
 * must continue to reflect the transfer's unchanged custody status.
 *
 * A mock req/res adapter is used so the handlers run against the real database
 * without needing a live HTTP server or session cookies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { query } from '../api/db.js';
import handler      from '../api/stock/transfers.js';
import inTransitHandler from '../api/stock/in-transit.js';

// ── Mock req/res factory ──────────────────────────────────────────────────────

/** Build a minimal mock request understood by parseBody + applyAuthCors. */
function mockReq({ method = 'GET', url = '/', body = {}, user = null } = {}) {
  return {
    method,
    url,
    headers: { host: 'localhost', origin: 'http://localhost' },
    user,
    body,        // parseBody() short-circuits when req.body is an object
    socket: {},
  };
}

/**
 * Build a mock response that resolves a promise when json() or end() is called.
 * res.status(code) is chainable (returns the same object).
 */
function mockRes() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });

  const obj = {
    statusCode: 200,
    headersSent: false,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    getHeader(k)    { return this._headers[k]; },
    status(code)    { this.statusCode = code; return this; },
    json(body)      { this.headersSent = true; resolve({ statusCode: this.statusCode, body }); return this; },
    end()           { this.headersSent = true; resolve({ statusCode: this.statusCode, body: null }); return this; },
    promise,
    resolve,
    reject,
  };
  return obj;
}

/** Call the PATCH handler and await its response. */
async function patchTransfer(id, payload, user) {
  const req = mockReq({
    method: 'PATCH',
    url: `http://localhost/api/stock/transfers?id=${id}`,
    body: { id, ...payload },
    user,
  });
  const res = mockRes();
  await handler(req, res);
  return res.promise;
}

/** Call the in-transit GET handler and await its response. */
async function getInTransit(user) {
  const req = mockReq({
    method: 'GET',
    url: 'http://localhost/api/stock/in-transit',
    user,
  });
  const res = mockRes();
  await inTransitHandler(req, res);
  return res.promise;
}

// ── Test user / identifiers ───────────────────────────────────────────────────

const ADMIN_USER = { fullName: 'Test Admin', role: 'admin', username: 'test_admin' };

const TRF_TARGET = 'TEST-DN170-TARGET';
const TRF_ACTIVE = 'TEST-DN170-ACTIVE'; // control — stays dispatched
const WAREHOUSE = 'windhoek_warehouse';
const BRANCH = 'test_branch_170';
const BATCH = 'TEST-DN170-BATCH';
const EXPIRY = '2030-12-31';
const productFor = id => `TEST_DN170_PRODUCT_${id}`;

const ALL_IDS = [TRF_TARGET, TRF_ACTIVE];
const ALL_PRODUCTS = ALL_IDS.map(productFor);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedTransfer(id, status) {
  const product = productFor(id);
  const hasReservation = !['pending', 'prepared'].includes(status);
  await query(
    `INSERT INTO stock_transfers
       (id, from_warehouse, to_branch, status, gm_approved_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    [id, WAREHOUSE, BRANCH, status, hasReservation ? 'Test GM' : null]
  );
  await query(
    `INSERT INTO stock_transfer_items
       (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved)
     VALUES ($1, $2, $2, $3, $4, 8, 8)`,
    [id, product, BATCH, EXPIRY]
  );
  await query(
    `INSERT INTO stock_batches
       (id, description, location, batch_no, expiry_date, quantity,
        remaining_quantity, dispatched_quantity, status)
     VALUES ($1, $2, $3, $4, $5, 20, $6, $7, 'available')`,
    [`SB-${id}`, product, WAREHOUSE, BATCH, EXPIRY, hasReservation ? 12 : 20, hasReservation ? 8 : 0]
  );
  await query(
    `INSERT INTO warehouse_inventory
       (id, warehouse_id, product_id, product_name, batch_no, expiry_date, quantity)
     VALUES ($1, $2, $3, $3, $4, $5, $6)`,
    [`WI-${id}`, WAREHOUSE, product, BATCH, EXPIRY, hasReservation ? 12 : 20]
  );
  if (hasReservation) {
    await query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, expiry_date, quantity, movement_type,
          source_location, source_location_type, destination_location,
          destination_location_type, reference_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 8, $5, $6, 'warehouse', $7,
               'in_transit', $8, 'posted', NOW(), NOW())`,
      [`SM-${id}`, product, BATCH, EXPIRY, status === 'approved' ? 'reserved' : 'transit_dispatch',
        WAREHOUSE, `in_transit:${id}`, id]
    );
  }
  // Before dispatch this deliberately represents a stale note to be cleaned up.
  // After dispatch it is custody evidence that direct cancellation must preserve.
  await query(
    `INSERT INTO dispatch_notes
       (id, transfer_id, barcode, from_warehouse, to_branch,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'in_transit', NOW(), NOW())`,
    [`DN-170-${id}`, id, `BC-170-${id}`, WAREHOUSE, BRANCH]
  );
}

async function snapshot(id) {
  const product = productFor(id);
  const [transfers, items, notes, batches, inventory, movements] = await Promise.all([
    query('SELECT * FROM stock_transfers WHERE id=$1', [id]),
    query('SELECT * FROM stock_transfer_items WHERE transfer_id=$1 ORDER BY id', [id]),
    query('SELECT * FROM dispatch_notes WHERE transfer_id=$1 ORDER BY id', [id]),
    query('SELECT * FROM stock_batches WHERE description=$1 ORDER BY id', [product]),
    query('SELECT * FROM warehouse_inventory WHERE product_name=$1 ORDER BY id', [product]),
    query('SELECT * FROM stock_movements WHERE reference_id=$1 ORDER BY id', [id]),
  ]);
  return {
    transfers: transfers.rows, items: items.rows, notes: notes.rows,
    batches: batches.rows, inventory: inventory.rows, movements: movements.rows,
  };
}

async function inTransitIds() {
  const { statusCode, body } = await getInTransit(ADMIN_USER);
  expect(statusCode).toBe(200);
  expect(body.success).toBe(true);
  return body.transfers.map(t => t.transferId);
}

async function cleanup() {
  await query(`DELETE FROM warehouse_inventory WHERE product_name = ANY($1::text[])`, [ALL_PRODUCTS]);
  await query(`DELETE FROM stock_batches WHERE description = ANY($1::text[])`, [ALL_PRODUCTS]);
  await query(`DELETE FROM stock_movements WHERE reference_id = ANY($1::text[])`, [ALL_IDS]);
  await query(`DELETE FROM inventory_balances WHERE product_name = ANY($1::text[])`, [ALL_PRODUCTS]);
  await query(`DELETE FROM dispatch_notes  WHERE transfer_id = ANY($1::text[])`, [ALL_IDS]);
  await query(`DELETE FROM stock_transfer_items WHERE transfer_id = ANY($1::text[])`, [ALL_IDS]);
  await query(`DELETE FROM stock_transfers WHERE id          = ANY($1::text[])`, [ALL_IDS]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe.sequential('Dispatch cancellation — pre-dispatch cleanup and post-dispatch safeguard (real handler)', () => {
  beforeEach(async () => {
    await cleanup();
    await seedTransfer(TRF_ACTIVE, 'dispatched');
  });

  afterEach(cleanup);

  const actions = ['cancelled', 'rejected'];
  const preDispatchCases = ['pending', 'prepared', 'approved']
    .flatMap(status => actions.map(action => [status, action]));

  it.each(preDispatchCases)('allows %s → %s, cleans up the note, and releases reservations only once', async (status, action) => {
    await seedTransfer(TRF_TARGET, status);
    const before = await snapshot(TRF_TARGET);
    const control = await snapshot(TRF_ACTIVE);
    const baselineIds = await inTransitIds();
    expect(baselineIds).not.toContain(TRF_TARGET);
    expect(baselineIds).toContain(TRF_ACTIVE);

    const result = await patchTransfer(TRF_TARGET, { status: action }, ADMIN_USER);
    expect(result.statusCode, JSON.stringify(result.body)).toBe(200);
    expect(result.body?.success).toBe(true);
    const after = await snapshot(TRF_TARGET);
    expect(after.transfers[0].status).toBe(action);
    expect(after.notes).toHaveLength(1);
    expect(after.notes[0].status).toBe('cancelled');
    expect(after.items).toEqual(before.items);
    expect(Number(after.batches[0].remaining_quantity)).toBe(20);
    expect(Number(after.batches[0].dispatched_quantity)).toBe(0);
    expect(Number(after.inventory[0].quantity)).toBe(20);
    if (status === 'approved') {
      expect(Number(before.batches[0].remaining_quantity)).toBe(12);
      expect(before.movements[0].status).toBe('posted');
      expect(after.movements).toHaveLength(1);
      expect(after.movements[0].status).toBe('cancelled');
    } else {
      expect(after.batches).toEqual(before.batches);
      expect(after.inventory).toEqual(before.inventory);
      expect(after.movements).toEqual([]);
    }

    const retry = await patchTransfer(TRF_TARGET, { status: action }, ADMIN_USER);
    expect(retry.statusCode, JSON.stringify(retry.body)).toBe(200);
    expect(retry.body?.success).toBe(true);
    const retried = await snapshot(TRF_TARGET);
    expect(retried.transfers[0].status).toBe(action);
    expect(retried.notes).toEqual(after.notes);
    expect(retried.batches).toEqual(after.batches);
    expect(retried.inventory).toEqual(after.inventory);
    expect(retried.movements).toEqual(after.movements);
    const ids = await inTransitIds();
    expect(ids).not.toContain(TRF_TARGET);
    expect(ids).toContain(TRF_ACTIVE);
    expect(await snapshot(TRF_ACTIVE)).toEqual(control);
  });

  const postDispatchCases = ['dispatched', 'in_transit', 'partially_received', 'received', 'delivered', 'completed']
    .flatMap(status => actions.map(action => [status, action]));

  it.each(postDispatchCases)('blocks %s → %s without mutating stock or dispatch evidence', async (status, action) => {
    await seedTransfer(TRF_TARGET, status);
    const before = await snapshot(TRF_TARGET);
    const control = await snapshot(TRF_ACTIVE);
    const baselineIds = await inTransitIds();
    expect(baselineIds.includes(TRF_TARGET)).toBe(['dispatched', 'in_transit'].includes(status));
    expect(baselineIds).toContain(TRF_ACTIVE);

    // Repeated blocked requests must also leave all persisted evidence intact.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await patchTransfer(TRF_TARGET, { status: action }, ADMIN_USER);
      expect(result.statusCode, JSON.stringify(result.body)).toBe(409);
      expect(result.body?.success).toBe(false);
      expect(result.body?.error).toMatch(/linked physical return|controlled return\/reversal/i);
      expect(await snapshot(TRF_TARGET)).toEqual(before);
    }
    const ids = await inTransitIds();
    expect(ids.includes(TRF_TARGET)).toBe(baselineIds.includes(TRF_TARGET));
    expect(ids).toContain(TRF_ACTIVE);
    expect(await snapshot(TRF_ACTIVE)).toEqual(control);
  });
});
