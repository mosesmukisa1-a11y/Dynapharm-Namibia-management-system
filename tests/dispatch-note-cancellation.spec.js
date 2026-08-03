// @vitest-environment node

/**
 * Dispatch note cancellation regression test (#170)
 *
 * Calls the real PATCH handler from api/stock/transfers.js (not a local copy)
 * to drive the cancel/reject transition, then asserts:
 *
 *   1. dispatch_notes.status is 'cancelled' in the DB after the handler runs.
 *   2. The Finance/GM in-transit dashboard handler (api/stock/in-transit.js)
 *      stops returning the cancelled/rejected transfer in its response.
 *   3. A control transfer that remains 'dispatched' still appears.
 *
 * A mock req/res adapter is used so the handlers run against the real database
 * without needing a live HTTP server or session cookies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

const TRF_CANCEL  = 'TEST-DN170-CANCEL';   // will be cancelled
const TRF_REJECT  = 'TEST-DN170-REJECT';   // will be rejected
const TRF_ACTIVE  = 'TEST-DN170-ACTIVE';   // control — stays dispatched

const ALL_IDS = [TRF_CANCEL, TRF_REJECT, TRF_ACTIVE];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function insertTransfer(id, status = 'dispatched') {
  await query(
    `INSERT INTO stock_transfers
       (id, from_warehouse, to_branch, status, created_at, updated_at)
     VALUES ($1, 'test_wh_170', 'test_branch_170', $2, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status, updated_at = NOW()`,
    [id, status]
  );
}

async function insertDispatchNote(transferId) {
  await query(
    `INSERT INTO dispatch_notes
       (id, transfer_id, barcode, from_warehouse, to_branch,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, 'test_wh_170', 'test_branch_170',
             'in_transit', NOW(), NOW())
     ON CONFLICT (id) DO UPDATE
       SET status = 'in_transit', updated_at = NOW()`,
    [`DN-170-${transferId}`, transferId, `BC-170-${transferId}`]
  );
}

async function dispatchNoteStatus(transferId) {
  const { rows } = await query(
    `SELECT status FROM dispatch_notes WHERE transfer_id = $1`,
    [transferId]
  );
  return rows[0]?.status ?? null;
}

async function cleanup() {
  await query(`DELETE FROM dispatch_notes  WHERE transfer_id = ANY($1::text[])`, [ALL_IDS]);
  await query(`DELETE FROM stock_transfers WHERE id          = ANY($1::text[])`, [ALL_IDS]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Cancelled dispatch notes — Finance/GM view regression (#170, real handler)', () => {
  beforeAll(async () => {
    await cleanup();
    // Insert all three as 'dispatched' with matching in_transit dispatch notes.
    for (const id of ALL_IDS) {
      await insertTransfer(id, 'dispatched');
      await insertDispatchNote(id);
    }
  });

  afterAll(cleanup);

  // ── Baseline: all appear before cancellation ───────────────────────────────

  it('all three dispatched transfers appear in the in-transit dashboard before any cancellation', async () => {
    const { statusCode, body } = await getInTransit(ADMIN_USER);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    const ids = (body.transfers || []).map(t => t.transferId);
    expect(ids).toContain(TRF_CANCEL);
    expect(ids).toContain(TRF_REJECT);
    expect(ids).toContain(TRF_ACTIVE);
  });

  // ── Cancel path ───────────────────────────────────────────────────────────

  it('PATCH to status=cancelled returns success', async () => {
    const result = await patchTransfer(TRF_CANCEL, { status: 'cancelled' }, ADMIN_USER);
    expect(result.statusCode).toBe(200);
    expect(result.body?.success).toBe(true);
  });

  it('the handler sets dispatch_notes.status to cancelled in the database', async () => {
    expect(await dispatchNoteStatus(TRF_CANCEL)).toBe('cancelled');
  });

  it('cancelled transfer no longer appears in the in-transit dashboard response', async () => {
    const { statusCode, body } = await getInTransit(ADMIN_USER);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    const ids = (body.transfers || []).map(t => t.transferId);
    expect(ids).not.toContain(TRF_CANCEL);
  });

  // ── Reject path ───────────────────────────────────────────────────────────

  it('PATCH to status=rejected returns success', async () => {
    const result = await patchTransfer(TRF_REJECT, { status: 'rejected' }, ADMIN_USER);
    expect(result.statusCode).toBe(200);
    expect(result.body?.success).toBe(true);
  });

  it('the handler sets dispatch_notes.status to cancelled for a rejected transfer', async () => {
    expect(await dispatchNoteStatus(TRF_REJECT)).toBe('cancelled');
  });

  it('rejected transfer no longer appears in the in-transit dashboard response', async () => {
    const { statusCode, body } = await getInTransit(ADMIN_USER);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    const ids = (body.transfers || []).map(t => t.transferId);
    expect(ids).not.toContain(TRF_REJECT);
  });

  // ── Control: active transfer stays visible ─────────────────────────────────

  it('the still-dispatched control transfer continues to appear in the in-transit dashboard', async () => {
    const { statusCode, body } = await getInTransit(ADMIN_USER);
    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    const ids = (body.transfers || []).map(t => t.transferId);
    expect(ids).toContain(TRF_ACTIVE);
  });

  it('the active dispatch note keeps status in_transit', async () => {
    expect(await dispatchNoteStatus(TRF_ACTIVE)).toBe('in_transit');
  });

  // ── Idempotency: second PATCH on already-cancelled transfer is safe ─────────

  it('a second PATCH to cancelled on an already-cancelled transfer is safe (status stays cancelled)', async () => {
    const result = await patchTransfer(TRF_CANCEL, { status: 'cancelled' }, ADMIN_USER);
    // The handler may return 200 (idempotent upsert) or a structured error —
    // either way the DB row must not flip back to in_transit.
    expect(await dispatchNoteStatus(TRF_CANCEL)).toBe('cancelled');
    // statusCode must not be a server error
    expect(result.statusCode).toBeLessThan(500);
  });
});
