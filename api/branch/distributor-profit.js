import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

function safeJson(v, fb) {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://localhost`);
  const pathParts = url.pathname.replace(/^\/api\/branch\/distributor-profit/, '').split('/').filter(Boolean);

  /* ── GET /api/branch/distributor-profit/referred-sales?distributor_nb=NB ── */
  if (pathParts[0] === 'referred-sales' && req.method === 'GET') {
    const nb = url.searchParams.get('distributor_nb');
    if (!nb) return res.status(400).json({ error: 'distributor_nb required' });
    const rows = await getMany(
      `SELECT bws.*,
              bdp.id          AS profit_id,
              bdp.profit_amount,
              bdp.status      AS profit_status,
              bdp.paid_at,
              bdp.sale_receipt AS profit_receipt
       FROM branch_walkin_sales bws
       LEFT JOIN branch_distributor_profit bdp ON bdp.sale_id = bws.id
       WHERE UPPER(bws.referral_nb) = $1
         AND (bws.customer_type IS NULL OR bws.customer_type <> 'member')
       ORDER BY bws.sale_date DESC
       LIMIT 500`,
      [nb.toUpperCase()]
    );
    return res.json({ success: true, sales: rows });
  }

  /* ── PATCH /api/branch/distributor-profit/:id/pay  (mark single as paid) ── */
  if (pathParts.length >= 2 && pathParts[1] === 'pay' && req.method === 'PATCH') {
    const id = pathParts[0];
    const body = safeJson(req.body, {});
    const { payment_method = 'cash', paid_by, note } = body;
    await query(
      `UPDATE branch_distributor_profit SET status='paid', paid_at=NOW(), paid_by=$1, payment_method=$2, payment_note=$3, updated_at=NOW() WHERE id=$4`,
      [paid_by || 'branch', payment_method, note || null, id]
    );
    return res.json({ success: true });
  }

  /* ── POST /api/branch/distributor-profit/pay-all  (bulk pay by distributor) ── */
  if (pathParts[0] === 'pay-all' && req.method === 'POST') {
    const body = safeJson(req.body, {});
    const { branch_id, distributor_nb, payment_method = 'cash', paid_by, note } = body;
    if (!branch_id || !distributor_nb) return res.status(400).json({ error: 'branch_id and distributor_nb required' });

    const result = await query(
      `UPDATE branch_distributor_profit
       SET status='paid', paid_at=NOW(), paid_by=$1, payment_method=$2, payment_note=$3, updated_at=NOW()
       WHERE branch_id=$4 AND distributor_nb=$5 AND status='pending'`,
      [paid_by || 'branch', payment_method, note || null, branch_id, distributor_nb]
    );
    return res.json({ success: true, updated: result.rowCount });
  }

  /* ── GET /api/branch/distributor-profit ── */
  if (req.method === 'GET') {
    const branchId = url.searchParams.get('branch_id');
    const distributorNb = url.searchParams.get('distributor_nb');
    const status = url.searchParams.get('status');
    const grouped = url.searchParams.get('grouped') === 'true';

    const conditions = [];
    const params = [];

    if (branchId) { conditions.push(`branch_id = $${params.length + 1}`); params.push(branchId); }
    if (distributorNb) { conditions.push(`distributor_nb = $${params.length + 1}`); params.push(distributorNb); }
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await getMany(
      `SELECT bdp.*,
              bws.items        AS sale_items,
              bws.customer_name AS sale_customer,
              bws.customer_type AS sale_customer_type,
              bws.total         AS sale_total,
              bws.sale_number   AS sale_number_ref
       FROM branch_distributor_profit bdp
       LEFT JOIN branch_walkin_sales bws ON bws.id = bdp.sale_id
       ${where} ORDER BY bdp.sale_date DESC LIMIT 1000`,
      params
    );

    if (grouped) {
      const map = {};
      for (const r of rows) {
        const key = r.distributor_nb;
        if (!map[key]) map[key] = { distributor_nb: r.distributor_nb, distributor_name: r.distributor_name, pending: 0, paid: 0, entries: [] };
        if (r.status === 'pending') map[key].pending += Number(r.profit_amount);
        else map[key].paid += Number(r.profit_amount);
        map[key].entries.push(r);
      }
      return res.json({ success: true, groups: Object.values(map) });
    }

    return res.json({ success: true, entries: rows });
  }

  /* ── POST /api/branch/distributor-profit  (manual entry) ── */
  if (req.method === 'POST') {
    const body = safeJson(req.body, {});
    const { branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount } = body;
    if (!branch_id || !distributor_nb || !profit_amount) return res.status(400).json({ error: 'branch_id, distributor_nb, profit_amount required' });
    const id = 'BDP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await query(
      `INSERT INTO branch_distributor_profit (id, branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW(),NOW())`,
      [id, branch_id, distributor_nb, distributor_name || null, sale_id || null, sale_receipt || null, sale_date || new Date().toISOString(), Number(profit_amount)]
    );
    return res.status(201).json({ success: true, id });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
