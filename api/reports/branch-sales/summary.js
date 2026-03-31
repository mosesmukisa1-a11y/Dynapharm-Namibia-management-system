/**
 * GET /api/reports/branch-sales/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Aggregates branch_activity_transactions by branch for a date range.
 */
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');

  if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

  try {
    const rows = await getMany(
      `SELECT
         branch_id,
         COUNT(*)::int                                                    AS transactions,
         COALESCE(SUM(grand_total), 0)::numeric                          AS total_revenue,
         COUNT(DISTINCT service_date)::int                                AS days_active,
         COALESCE(SUM(CASE WHEN activity_type = 'member_sale'            THEN grand_total ELSE 0 END), 0)::numeric AS member_total,
         COALESCE(SUM(CASE WHEN activity_type = 'non_member_sale'        THEN grand_total ELSE 0 END), 0)::numeric AS non_member_total,
         COALESCE(SUM(CASE WHEN activity_type = 'prescription_dispensing' THEN grand_total ELSE 0 END), 0)::numeric AS rx_total,
         COALESCE(SUM(CASE WHEN activity_type = 'consultation'           THEN grand_total ELSE 0 END), 0)::numeric AS consult_total,
         COALESCE(SUM(CASE WHEN activity_type = 'walkin_sale'            THEN grand_total ELSE 0 END), 0)::numeric AS walkin_total
       FROM branch_activity_transactions
       WHERE service_date >= $1 AND service_date <= $2
       GROUP BY branch_id
       ORDER BY total_revenue DESC`,
      [from, to]
    );

    return res.json({ success: true, rows, from, to });
  } catch (err) {
    console.error('[branch-sales/summary]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
