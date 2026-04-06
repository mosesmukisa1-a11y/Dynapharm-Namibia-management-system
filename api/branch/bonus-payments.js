import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
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
        bonuses = await getMany(
          `SELECT b.*, COALESCE(b.amount_earned, 0) - COALESCE(b.amount_paid, 0) AS outstanding
           FROM distributor_bonuses b
           WHERE b.status IN ('pending', 'partial')
           ORDER BY b.period DESC, b.distributor_name`,
          []
        );
      } else {
        bonuses = await getMany(
          `SELECT b.*, COALESCE(b.amount_earned, 0) - COALESCE(b.amount_paid, 0) AS outstanding
           FROM distributor_bonuses b
           LEFT JOIN distributors d ON d.distributor_code = b.nb_number
           WHERE b.status IN ('pending', 'partial')
             AND (d.branch = $1 OR b.paid_by_branch_id = $1)
           ORDER BY b.period DESC, b.distributor_name`,
          [effectiveBranch]
        );
      }

      const paidParams = [];
      const paidWhere = [];
      if (effectiveBranch) {
        paidParams.push(effectiveBranch);
        paidWhere.push(`p.branch_id = $${paidParams.length}`);
      } else if (branchScope.enforced && branchScope.branches?.length) {
        paidParams.push(branchScope.branches);
        paidWhere.push(`p.branch_id = ANY($${paidParams.length})`);
      }
      if (from) {
        paidParams.push(from);
        paidWhere.push(`p.paid_at >= $${paidParams.length}::date`);
      }
      if (to) {
        paidParams.push(to);
        paidWhere.push(`p.paid_at <= $${paidParams.length}::date`);
      }

      const paidHistory = await getMany(
        `SELECT p.*, b.nb_number, b.distributor_name, b.period
         FROM distributor_bonus_payments p
         JOIN distributor_bonuses b ON b.id = p.bonus_id
         ${paidWhere.length ? 'WHERE ' + paidWhere.join(' AND ') : ''}
         ORDER BY p.paid_at DESC
         LIMIT 500`,
        paidParams
      );

      return res.json({ success: true, bonuses, paidHistory, total: bonuses.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { bonus_id, amount, paid_at, notes } = body;

      if (!bonus_id || !amount) {
        return res.status(400).json({ success: false, error: 'bonus_id and amount are required' });
      }

      const branchScope = getBranchScope(req.user);
      let branchId;
      if (isFullAccess) {
        branchId = body.branch_id || req.user.branch || '';
      } else {
        branchId = req.user.branch || '';
        if (!branchId) {
          return res.status(400).json({ success: false, error: 'No branch assigned to your account' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(branchId)) {
          return res.status(403).json({ success: false, error: 'Access denied for this branch' });
        }
      }

      const bonus = await getOne(`SELECT * FROM distributor_bonuses WHERE id = $1`, [bonus_id]);
      if (!bonus) {
        return res.status(404).json({ success: false, error: 'Bonus record not found' });
      }

      if (!isFullAccess) {
        const distributor = await getOne(
          `SELECT branch FROM distributors WHERE distributor_code = $1`,
          [bonus.nb_number]
        );
        if (distributor && distributor.branch && distributor.branch !== branchId) {
          return res.status(403).json({ success: false, error: 'This distributor is not registered at your branch' });
        }
      }

      const payAmount = parseFloat(amount);
      const outstanding = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
      if (payAmount <= 0 || payAmount > outstanding + 0.01) {
        return res.status(400).json({ success: false, error: `Payment amount exceeds outstanding balance of ${outstanding.toFixed(2)}` });
      }

      const payId = `BPAY-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const paidDate = paid_at || new Date().toISOString().slice(0, 10);
      const recordedBy = req.user.full_name || req.user.username || 'branch';

      await query(
        `INSERT INTO distributor_bonus_payments (id, bonus_id, branch_id, amount, paid_at, recorded_by, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [payId, bonus_id, branchId, payAmount, paidDate, recordedBy, notes || null]
      );

      const newAmountPaid = parseFloat(bonus.amount_paid) + payAmount;
      const newOutstanding = parseFloat(bonus.amount_earned) - newAmountPaid;
      const newStatus = newOutstanding <= 0.01 ? 'paid' : 'partial';

      await query(
        `UPDATE distributor_bonuses
         SET amount_paid = $1, status = $2, paid_by_branch_id = $3, payment_date = $4, updated_at = NOW()
         WHERE id = $5`,
        [newAmountPaid, newStatus, branchId, paidDate, bonus_id]
      );

      return res.json({ success: true, payment_id: payId, new_status: newStatus, amount_paid: newAmountPaid, outstanding: Math.max(0, newOutstanding) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[branch/bonus-payments]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
