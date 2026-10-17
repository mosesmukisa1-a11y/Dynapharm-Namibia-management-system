import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function generateId(prefix = 'DEP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeDeposit(row) {
  if (!row) return null;
  const slipFile =
  row.slip_file && typeof row.slip_file === 'object' ?
  row.slip_file :
  typeof row.slip_file === 'string' ?
  JSON.parse(row.slip_file) :
  null;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: row.id,
    branchId: row.branch_id,
    branch_id: row.branch_id,
    branch: row.branch_id,
    date: row.date ? row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10) : null,
    amount: row.amount !== null ? Number(row.amount) : 0,
    slipNumber: row.slip_number || '',
    slip_number: row.slip_number || '',
    bankName: row.bank_name || '',
    bank_name: row.bank_name || '',
    bankBranch: row.bank_branch || '',
    accountNumber: row.account_number || '',
    accountType: row.account_type || '',
    depositedBy: row.deposited_by || '',
    deposited_by: row.deposited_by || '',
    notes: row.notes || '',
    slipFile,
    status: row.status || 'pending',
    decisionNotes: row.decision_notes || '',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
    createdBy: row.created_by || '',
    created_by: row.created_by || '',
    createdAt,
    created_at: createdAt,
    reference: row.slip_number || ''
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const currentUser = req.user || null;

  try {
    if (req.method === 'GET') {
      const id = searchParams.get('id');
      if (id) {
        const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/deposits.js:92:0"), [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Deposit not found' });
        }
        return res.status(200).json({ success: true, deposit: normalizeDeposit(row) });
      }

      const branchScope = getBranchScope(currentUser);
      const requestedBranch = searchParams.get('branch');
      // Require branch only for admin-level roles (admin/gm/director) to prevent
      // accidental all-branches dumps. Finance and other reporting roles may query
      // without a branch to get a cross-branch view.
      if (branchScope.requiresBranchParam && !requestedBranch) {
        return res.status(400).json({ success: false, error: 'branch parameter is required' });
      }
      const effectiveBranchId = branchScope.enforced ? branchScope.primaryBranch || branchScope.branches?.[0] || null : requestedBranch;
      const status = searchParams.get('status');
      const from = searchParams.get('from');
      const to = searchParams.get('to');
      const limitParam = parseInt(searchParams.get('limit') || '500', 10);
      const effectiveLimit = Number.isNaN(limitParam) ? 500 : limitParam;

      const conditions = [];
      const params = [];

      if (effectiveBranchId) {
        params.push(effectiveBranchId);
        conditions.push(__qd_registeredPlan("api/branch/deposits.js:119:1", [params.length]));
      }
      if (status) {
        params.push(status);
        conditions.push(__qd_registeredPlan("api/branch/deposits.js:123:2", [params.length]));
      }
      if (from) {
        params.push(from);
        conditions.push(__qd_registeredPlan("api/branch/deposits.js:127:3", [params.length]));
      }
      if (to) {
        params.push(to);
        conditions.push(__qd_registeredPlan("api/branch/deposits.js:131:4", [params.length]));
      }

      params.push(effectiveLimit);
      const whereClause = conditions.length > 0 ? __qd_registeredPlan("api/branch/deposits.js:135:5", [__qd_joinPlans(conditions, "and")]) : __qd_registeredPlan("api/branch/deposits.js:135:6");
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/deposits.js:137:7", [
      whereClause, params.length]),
      params);


      return res.status(200).json({
        success: true,
        deposits: rows.map(normalizeDeposit).filter(Boolean)
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const branchId = body.branchId || body.branch || currentUser?.branch || currentUser?.branchId;
      if (!branchId) {
        return res.status(400).json({ success: false, error: 'branchId is required — please ensure you are logged in with a branch account' });
      }

      const date = body.date || new Date().toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (date > today) {
        return res.status(400).json({ success: false, error: `Deposit date cannot be in the future (${date}). Today is ${today}.` });
      }

      const amount = parseNumber(body.amount, null);
      if (amount === null || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amount must be greater than zero' });
      }

      const depositId = generateId('DEP');
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/branch/deposits.js:167:8"),








      [
      depositId,
      branchId,
      date,
      amount,
      body.slipNumber || body.slipNo || '',
      body.bankName || '',
      body.bankBranch || '',
      body.accountNumber || '',
      body.accountType || '',
      body.depositedBy || currentUser?.fullName || currentUser?.username || 'system',
      body.notes || '',
      body.slipFile ? JSON.stringify(body.slipFile) : null,
      currentUser?.username || currentUser?.fullName || 'system']);



      return res.status(201).json({
        success: true,
        deposit: normalizeDeposit(result.rows[0])
      });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await parseJsonBody(req);
      const id = body.id || body.depositId;
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/deposits.js:205:9"), [id]);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Deposit not found' });
      }

      const status = body.status ? body.status.toLowerCase() : null;
      const allowedStatuses = ['pending', 'approved', 'rejected'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }

      const updatedRow = await __qd_executePlan(query, __qd_registeredPlan("api/branch/deposits.js:217:10"),










      [
      status,
      body.decisionNotes || body.notes || null,
      body.reviewedBy || currentUser?.fullName || currentUser?.username || 'system',
      id]);



      if (status === 'approved' || status === 'rejected') {
        const branchId = row.branch_id || '';
        const amount = Number(row.amount || 0).toFixed(2);
        const notifId = `NOTIF-DEP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const isApproved = status === 'approved';
        await __qd_executePlan(query, __qd_registeredPlan("api/branch/deposits.js:241:11"),


        [
        notifId,
        branchId,
        isApproved ? 'Deposit Verified' : 'Deposit Rejected',
        isApproved ?
        `Your bank deposit of N$${amount} has been verified by Finance.` :
        `Your bank deposit of N$${amount} was rejected by Finance.${body.decisionNotes || body.notes ? ' Reason: ' + (body.decisionNotes || body.notes) : ''}`,
        isApproved ? 'success' : 'warning']).

        catch((e) => console.error('[deposits] notification insert failed:', e));
      }

      return res.status(200).json({
        success: true,
        deposit: normalizeDeposit(updatedRow.rows[0])
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Branch deposits API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
