import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const ADMIN_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  const isAdmin = ADMIN_ROLES.has(role);
  const isDistributor = role === 'distributor';

  if (!isAdmin && !isDistributor) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let nbUpper;

    if (isDistributor) {
      const nbFromToken = req.user.username;
      if (!nbFromToken) {
        return res.status(400).json({ success: false, error: 'Distributor NB number not found on account. Contact admin.' });
      }
      nbUpper = nbFromToken.toUpperCase();
    } else {
      const nb = url.searchParams.get('nb') || url.searchParams.get('nb_number') || '';
      if (!nb) {
        return res.status(400).json({ success: false, error: 'NB number is required' });
      }
      nbUpper = nb.toUpperCase();
    }

    const bonuses = await getMany(
      `SELECT b.id, b.period, b.nb_number, b.distributor_name,
              b.amount_earned, b.amount_paid, b.status,
              b.paid_by_branch_id, b.payment_date, b.created_at,
              COALESCE(b.amount_earned, 0) - COALESCE(b.amount_paid, 0) AS outstanding
       FROM distributor_bonuses b
       WHERE b.nb_number = $1
       ORDER BY b.period DESC`,
      [nbUpper]
    );

    if (bonuses.length === 0) {
      return res.json({ success: true, bonuses: [], payments: [], hasOutstanding: false, nbNumber: nbUpper });
    }

    const bonusIds = bonuses.map(b => b.id);
    const payments = await getMany(
      `SELECT p.id, p.bonus_id, p.branch_id, p.amount, p.paid_at, p.recorded_by, p.notes, p.created_at
       FROM distributor_bonus_payments p
       WHERE p.bonus_id = ANY($1)
       ORDER BY p.paid_at DESC`,
      [bonusIds]
    );

    const payMap = {};
    for (const p of payments) {
      if (!payMap[p.bonus_id]) payMap[p.bonus_id] = [];
      payMap[p.bonus_id].push(p);
    }

    const enriched = bonuses.map(b => ({
      ...b,
      outstanding: Number(b.amount_earned) - Number(b.amount_paid),
      payments: payMap[b.id] || [],
    }));

    const hasOutstanding = enriched.some(b => b.outstanding > 0.01);
    const totalEarned = enriched.reduce((s, b) => s + Number(b.amount_earned), 0);
    const totalPaid = enriched.reduce((s, b) => s + Number(b.amount_paid), 0);

    return res.json({
      success: true,
      bonuses: enriched,
      payments,
      hasOutstanding,
      nbNumber: nbUpper,
      summary: {
        totalEarned,
        totalPaid,
        totalOutstanding: totalEarned - totalPaid,
      },
    });
  } catch (err) {
    console.error('[distributor/bonus]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
