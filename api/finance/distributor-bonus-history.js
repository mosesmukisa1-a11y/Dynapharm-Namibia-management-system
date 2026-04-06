import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const FINANCE_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  if (!FINANCE_ROLES.has(role)) {
    return res.status(403).json({ success: false, error: 'Finance access required' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const search = url.searchParams.get('search') || '';
    const nb = url.searchParams.get('nb') || '';
    const period = url.searchParams.get('period') || '';
    const status = url.searchParams.get('status') || '';

    const params = [];
    const where = [];

    if (nb) {
      params.push(nb.toUpperCase());
      where.push(`b.nb_number = $${params.length}`);
    } else if (search) {
      params.push(`%${search}%`);
      where.push(`(b.nb_number ILIKE $${params.length} OR b.distributor_name ILIKE $${params.length})`);
    }

    if (period) {
      params.push(period);
      where.push(`b.period = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`b.status = $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const bonuses = await getMany(
      `SELECT b.id, b.period, b.nb_number, b.distributor_name,
              b.amount_earned, b.amount_paid, b.status,
              b.paid_by_branch_id, b.payment_date, b.uploaded_by, b.created_at,
              COALESCE(b.amount_earned, 0) - COALESCE(b.amount_paid, 0) AS outstanding
       FROM distributor_bonuses b
       ${whereClause}
       ORDER BY b.period DESC, b.distributor_name`,
      params
    );

    if (bonuses.length === 0) {
      return res.json({ success: true, history: [], total: 0 });
    }

    const bonusIds = bonuses.map(b => b.id);
    const payments = await getMany(
      `SELECT p.*, b.nb_number, b.distributor_name, b.period
       FROM distributor_bonus_payments p
       JOIN distributor_bonuses b ON b.id = p.bonus_id
       WHERE p.bonus_id = ANY($1)
       ORDER BY p.paid_at DESC`,
      [bonusIds]
    );

    const payMap = {};
    for (const p of payments) {
      if (!payMap[p.bonus_id]) payMap[p.bonus_id] = [];
      payMap[p.bonus_id].push(p);
    }

    const history = bonuses.map(b => ({
      ...b,
      outstanding: Number(b.amount_earned) - Number(b.amount_paid),
      payments: payMap[b.id] || [],
    }));

    return res.json({ success: true, history, total: history.length });
  } catch (err) {
    console.error('[finance/distributor-bonus-history]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
