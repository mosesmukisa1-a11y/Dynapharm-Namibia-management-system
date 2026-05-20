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
    const nbUpper = nb.toUpperCase();

    // Four-part UNION for complete coverage.  All arms share the same 15 columns.
    //
    // Part A — BDP entries whose sale_id points to branch_walkin_sales (walk-in profits).
    //   Uses LEFT JOIN so orphaned BDP rows (sale deleted) still appear.
    //   Excludes prescription BDP entries (those go to Part B).
    //
    // Part B — BDP entries whose sale_id is a prescription report (RPT-…).
    //   JOINs branch_activity_transactions on form_reference_id to get customer/total data.
    //   Previously these showed as ghost rows with NULL customer name and total.
    //
    // Part C — branch_walkin_sales rows with referral_nb = NB that have no BDP entry.
    //   Fallback for historical records / missed profit writes.
    //
    // Part D — branch_activity_transactions prescription rows with referral_nb = NB
    //   that have no BDP entry (profit write failed edge case).
    //   profit_amount derived from product_total_cp − product_total_dp.
    const rows = await getMany(
      `SELECT
         COALESCE(bws.id, bdp.sale_id)          AS id,
         COALESCE(bws.branch_id, bdp.branch_id)  AS branch_id,
         COALESCE(bws.sale_date, bdp.sale_date)  AS sale_date,
         bws.items,
         bws.customer_name,
         bws.customer_type,
         bws.total,
         bws.sale_number,
         bws.referral_nb,
         bdp.id            AS profit_id,
         bdp.profit_amount,
         bdp.status         AS profit_status,
         bdp.paid_at,
         bdp.sale_receipt   AS profit_receipt,
         NULL::text         AS sale_type
       FROM branch_distributor_profit bdp
       LEFT JOIN branch_walkin_sales bws ON bws.id = bdp.sale_id
       WHERE UPPER(bdp.distributor_nb) = $1
         AND NOT EXISTS (
           SELECT 1 FROM branch_activity_transactions bat
           WHERE bat.form_reference_id = bdp.sale_id
             AND bat.activity_type = 'prescription_dispensing'
         )

       UNION

       SELECT
         bdp.sale_id                                   AS id,
         COALESCE(bat.branch_id, bdp.branch_id)        AS branch_id,
         COALESCE(bat.service_date, bdp.sale_date)     AS sale_date,
         NULL::text                                    AS items,
         bat.client_name                               AS customer_name,
         bat.client_type                               AS customer_type,
         bat.grand_total                               AS total,
         bat.form_reference_id                         AS sale_number,
         bat.referral_nb,
         bdp.id                                        AS profit_id,
         bdp.profit_amount,
         bdp.status                                    AS profit_status,
         bdp.paid_at,
         bdp.sale_receipt                              AS profit_receipt,
         'prescription'::text                          AS sale_type
       FROM branch_distributor_profit bdp
       JOIN branch_activity_transactions bat
         ON bat.form_reference_id = bdp.sale_id
        AND bat.activity_type = 'prescription_dispensing'
       WHERE UPPER(bdp.distributor_nb) = $1

       UNION

       SELECT
         bws.id,
         bws.branch_id,
         bws.sale_date,
         bws.items,
         bws.customer_name,
         bws.customer_type,
         bws.total,
         bws.sale_number,
         bws.referral_nb,
         NULL::text        AS profit_id,
         NULL::numeric     AS profit_amount,
         NULL::text        AS profit_status,
         NULL::timestamptz AS paid_at,
         NULL::text        AS profit_receipt,
         NULL::text        AS sale_type
       FROM branch_walkin_sales bws
       WHERE UPPER(bws.referral_nb) = $1
         AND (bws.customer_type IS NULL OR bws.customer_type <> 'member')
         AND NOT EXISTS (
           SELECT 1 FROM branch_distributor_profit p
           WHERE p.sale_id = bws.id AND UPPER(p.distributor_nb) = $1
         )

       UNION

       SELECT
         bat.id,
         bat.branch_id,
         bat.service_date                                               AS sale_date,
         NULL::text                                                     AS items,
         bat.client_name                                                AS customer_name,
         bat.client_type                                                AS customer_type,
         bat.grand_total                                                AS total,
         bat.form_reference_id                                          AS sale_number,
         bat.referral_nb,
         NULL::text                                                     AS profit_id,
         CASE
           WHEN bat.product_total_cp IS NOT NULL
            AND bat.product_total_dp IS NOT NULL
           THEN GREATEST(0, bat.product_total_cp - bat.product_total_dp)
           ELSE NULL
         END                                                            AS profit_amount,
         NULL::text                                                     AS profit_status,
         NULL::timestamptz                                              AS paid_at,
         NULL::text                                                     AS profit_receipt,
         'prescription'::text                                           AS sale_type
       FROM branch_activity_transactions bat
       WHERE bat.activity_type = 'prescription_dispensing'
         AND UPPER(bat.referral_nb) = $1
         AND NOT EXISTS (
           SELECT 1 FROM branch_distributor_profit p
           WHERE p.sale_id = bat.form_reference_id
             AND UPPER(p.distributor_nb) = $1
         )

       ORDER BY sale_date DESC NULLS LAST
       LIMIT 500`,
      [nbUpper]
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

    if (branchId) { conditions.push(`bdp.branch_id = $${params.length + 1}`); params.push(branchId); }
    if (distributorNb) { conditions.push(`bdp.distributor_nb = $${params.length + 1}`); params.push(distributorNb); }
    if (status) { conditions.push(`bdp.status = $${params.length + 1}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await getMany(
      `SELECT bdp.*,
              COALESCE(bdp.distributor_name, d.distributor_name) AS distributor_name,
              bws.items        AS sale_items,
              bws.customer_name AS sale_customer,
              bws.customer_type AS sale_customer_type,
              bws.total         AS sale_total,
              bws.sale_number   AS sale_number_ref
       FROM branch_distributor_profit bdp
       LEFT JOIN branch_walkin_sales bws ON bws.id = bdp.sale_id
       LEFT JOIN distributors d ON d.distributor_code = bdp.distributor_nb
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
