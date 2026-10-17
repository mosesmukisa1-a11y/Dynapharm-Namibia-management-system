import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

const FULL_ACCESS_ROLES = new Set(['admin', 'gm', 'director', 'finance']);
const BRANCH_ROLES = new Set(['dispenser', 'branch_manager', 'consultant', 'pharmacist']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  const isFullAccess = FULL_ACCESS_ROLES.has(role);
  const isBranchRole = BRANCH_ROLES.has(role);
  if (!isFullAccess && !isBranchRole) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const requestedBranch = url.searchParams.get('branch') || '';
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';

      const branchScope = getBranchScope(req.user);

      let effectiveBranch;
      if (isFullAccess) {
        effectiveBranch = requestedBranch;
      } else {
        effectiveBranch = req.user.branch || '';
        if (!effectiveBranch) {
          return res.status(403).json({ success: false, error: 'No branch assigned to your account' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(effectiveBranch)) {
          return res.status(403).json({ success: false, error: 'Access denied to requested branch' });
        }
      }

      let bonuses;
      if (isFullAccess && !effectiveBranch) {
        bonuses = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/bonus-payments.js:47:0"),




        []);

      } else {
        bonuses = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/bonus-payments.js:55:1"),




        []);

      }

      const paidParams = [];
      const paidWhere = [];
      if (effectiveBranch) {
        paidParams.push(effectiveBranch);
        paidWhere.push(__qd_registeredPlan("api/branch/bonus-payments.js:67:3", [paidParams.length]));
      } else if (branchScope.enforced && branchScope.branches?.length) {
        paidParams.push(branchScope.branches);
        paidWhere.push(__qd_registeredPlan("api/branch/bonus-payments.js:70:4", [paidParams.length]));
      }
      if (from) {
        paidParams.push(from);
        paidWhere.push(__qd_registeredPlan("api/branch/bonus-payments.js:74:5", [paidParams.length]));
      }
      if (to) {
        paidParams.push(to);
        paidWhere.push(__qd_registeredPlan("api/branch/bonus-payments.js:78:6", [paidParams.length]));
      }

      const paidHistory = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/bonus-payments.js:82:8", [



      paidWhere.length ? __qd_joinPlans([__qd_registeredPlan("api/branch/bonus-payments.js:85:2"), __qd_joinPlans(paidWhere, "and")], "empty") : __qd_registeredPlan("api/branch/bonus-payments.js:85:7")]),


      paidParams);


      return res.json({ success: true, bonuses, paidHistory, total: bonuses.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { bonus_id, paid_at, notes } = body;

      if (!bonus_id) {
        return res.status(400).json({ success: false, error: 'bonus_id is required' });
      }

      const branchScope = getBranchScope(req.user);
      let branchId;
      if (isFullAccess) {
        // Finance staff with no branch assigned → mark as paid by 'finance'
        branchId = body.branch_id || req.user.branch || (role === 'finance' ? 'finance' : '');
      } else {
        branchId = req.user.branch || '';
        if (!branchId) {
          return res.status(400).json({ success: false, error: 'No branch assigned to your account' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(branchId)) {
          return res.status(403).json({ success: false, error: 'Access denied for this branch' });
        }
      }

      const bonus = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/bonus-payments.js:117:9"), [bonus_id]);
      if (!bonus) {
        return res.status(404).json({ success: false, error: 'Bonus record not found' });
      }

      if (bonus.status === 'paid') {
        return res.status(409).json({ success: false, error: `This bonus for ${bonus.distributor_name} (${bonus.period}) has already been paid by branch ${bonus.paid_by_branch_id || 'another branch'}.` });
      }

      const payAmount = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
      if (payAmount <= 0.01) {
        return res.status(409).json({ success: false, error: 'No outstanding balance on this bonus.' });
      }

      const payId = `BPAY-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const paidDate = paid_at || new Date().toISOString().slice(0, 10);
      const recordedBy = req.user.full_name || req.user.username || 'branch';

      await __qd_executePlan(query, __qd_registeredPlan("api/branch/bonus-payments.js:136:10"),


      [payId, bonus_id, branchId, payAmount, paidDate, recordedBy, notes || null]);


      await __qd_executePlan(query, __qd_registeredPlan("api/branch/bonus-payments.js:142:11"),



      [branchId, paidDate, bonus_id]);


      const moveId = `BMOV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const activeSession = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/bonus-payments.js:150:12"),

      [branchId]);

      if (activeSession) {
        await __qd_executePlan(query, __qd_registeredPlan("api/branch/bonus-payments.js:155:13"),


        [moveId, activeSession.id, branchId, `Bonus payment to ${bonus.distributor_name} (${bonus.nb_number}) - ${bonus.period}`, payAmount, recordedBy, payId, notes || null]);

      }

      return res.json({
        success: true,
        payment_id: payId,
        new_status: 'paid',
        amount_paid: payAmount,
        outstanding: 0,
        receipt: {
          payment_id: payId,
          nb_number: bonus.nb_number,
          distributor_name: bonus.distributor_name,
          period: bonus.period,
          amount: payAmount,
          paid_at: paidDate,
          branch_id: branchId,
          recorded_by: recordedBy,
          notes: notes || null
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[branch/bonus-payments]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
