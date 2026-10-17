import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';

function nowIso() {return new Date().toISOString();}
function shortId() {return `PC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;}

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = pathname.replace(/^\/api\/finance\/petty-cash\/?/, '').split('/').filter(Boolean);
  const sub = parts[0];
  const id = parts[1];

  try {
    // GET /api/finance/petty-cash/balance
    if (req.method === 'GET' && sub === 'balance') {
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/petty-cash.js:21:0"), []);
      return res.json({ success: true, accounts: rows });
    }

    // GET /api/finance/petty-cash/requests
    if (req.method === 'GET' && (!sub || sub === 'requests')) {
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/petty-cash.js:28:1"), []);


      return res.json({ success: true, requests: rows });
    }

    // POST /api/finance/petty-cash/requests — Finance creates request
    if (req.method === 'POST' && (!sub || sub === 'requests')) {
      const body = req.body || {};
      if (!body.amount || !body.purpose) {
        return res.status(400).json({ error: 'amount and purpose are required' });
      }
      const rec = await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:40:2"),




      [
      shortId(),
      `PCR-${Date.now()}`,
      Number(body.amount),
      body.purpose,
      body.location || 'head_office',
      req.user?.fullName || req.user?.username || 'Finance',
      nowIso()]);


      return res.status(201).json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/approve — GM approves
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'approve') {
      if (!['gm', 'admin', 'director'].includes(req.user.role)) return res.status(403).json({ error: 'GM approval access required' });
      const body = req.body || {};
      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:61:3"), [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found' });
      if (existing.status === 'pending_director') return res.json({ success: true, request: existing });
      if (existing.status !== 'pending_gm') return res.status(409).json({ error: 'Request is already processed' });
      const rec = await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:66:4"),




      [req.user.sub || req.user.id || req.user.username, nowIso(), body.notes || null, id]);

      if (!rec.rows.length) return res.status(404).json({ error: 'Request not found or already processed' });
      return res.json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/reject — GM or Director rejects
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'reject') {
      if (!['gm', 'director', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'GM or Director access required' });
      const body = req.body || {};
      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:80:5"), [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found' });
      if (existing.status === 'rejected') return res.json({ success: true, request: existing });
      if (!['pending_gm', 'pending_director'].includes(existing.status)) return res.status(409).json({ error: 'Request is already processed' });
      if (existing.status === 'pending_director' && req.user.role === 'gm') return res.status(403).json({ error: 'Request is already forwarded to Director' });
      const rec = await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:86:6"),




      [req.user.sub || req.user.id || req.user.username, nowIso(), body.notes || null, id]);

      if (!rec.rows.length) return res.status(404).json({ error: 'Request not found or already processed' });
      return res.json({ success: true, request: rec.rows[0] });
    }

    // PUT /api/finance/petty-cash/requests/:id/issue — Director issues cash
    if (req.method === 'PUT' && sub === 'requests' && id && parts[2] === 'issue') {
      const body = req.body || {};
      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:99:7"), [id]);
      if (!existing) return res.status(404).json({ error: 'Request not found or not yet GM-approved' });

      const issuedAt = nowIso();
      const issuedBy = req.user?.fullName || req.user?.username || 'Director';

      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:106:8"),



      [issuedBy, issuedAt, body.notes || null, id]);


      // Credit the petty cash account
      const location = existing.location || 'head_office';
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:115:9"),







      [`PCA-${location}`, location, Number(existing.amount), issuedAt, issuedBy]);


      // Log the top-up in petty_cash_transactions
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:127:10"),



      [
      `PCT-${Date.now()}`,
      location,
      Number(existing.amount),
      `Petty cash issued: ${existing.purpose}`,
      id,
      issuedBy,
      issuedAt]);



      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:141:11"), [id]);
      const account = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:142:12"), [location]);
      return res.json({ success: true, request: updated, account });
    }

    // POST /api/finance/petty-cash/spend — record a petty cash expense
    if (req.method === 'POST' && sub === 'spend') {
      const body = req.body || {};
      if (!body.amount || !body.description) {
        return res.status(400).json({ error: 'amount and description are required' });
      }
      const location = body.location || 'head_office';
      const amount = Number(body.amount);

      // Check balance
      const acct = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:156:13"), [location]);
      if (!acct || Number(acct.balance) < amount) {
        return res.status(400).json({ error: `Insufficient petty cash balance. Available: N$${acct ? acct.balance : 0}` });
      }

      // Deduct from petty cash account
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:163:14"),

      [amount, location]);


      // Log the transaction
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:169:15"),



      [
      `PCT-${Date.now()}`,
      location,
      amount,
      body.description,
      body.category || 'General',
      body.branch_id || location,
      body.reference_id || null,
      req.user?.fullName || req.user?.username || 'Finance',
      nowIso()]);



      // Also record in branch_expenses for overhead tracking
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/petty-cash.js:187:16"),



      [
      `EXP-${Date.now()}`,
      body.branch_id || location,
      amount,
      body.description,
      body.category || 'General',
      req.user?.fullName || req.user?.username || 'Finance']);



      const updatedAcct = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/petty-cash.js:200:17"), [location]);
      return res.status(201).json({ success: true, account: updatedAcct });
    }

    // GET /api/finance/petty-cash/transactions
    if (req.method === 'GET' && sub === 'transactions') {
      const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const location = searchParams.get('location');
      let sql = __qd_registeredPlan("api/finance/petty-cash.js:208:18");
      const params = [];
      if (location) {sql = __qd_joinPlans([sql, __qd_registeredPlan("api/finance/petty-cash.js:210:19")], "empty");params.push(location);}
      sql = __qd_joinPlans([sql, __qd_registeredPlan("api/finance/petty-cash.js:211:20")], "empty");
      const rows = await __qd_executePlan(getMany, sql, params);
      return res.json({ success: true, transactions: rows });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[petty-cash]', err);
    return res.status(500).json({ error: err.message });
  }
}
export default atomicStockRequest(handler);
