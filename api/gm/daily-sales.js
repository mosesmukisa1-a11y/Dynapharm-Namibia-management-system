/**
 * GET /api/gm/daily-sales
 * Today's sales breakdown across all branches.
 * Returns: countrywide total + per-branch detail.
 */
import { getMany } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const dateParam = searchParams.get('date'); // optional override, defaults to today

  // Build the target date in Namibia time (UTC+2)
  let targetDate;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    const now = new Date();
    const nbt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // UTC+2
    targetDate = nbt.toISOString().slice(0, 10);
  }

  const rows = await getMany(
    `SELECT
       branch_id,
       COUNT(*)                                                             AS transaction_count,
       COALESCE(SUM(total), 0)                                             AS revenue,
       COALESCE(SUM(CASE WHEN customer_type ILIKE '%member%'
                          AND customer_type NOT ILIKE '%non%'
                        THEN total ELSE 0 END), 0)                         AS member_revenue,
       COALESCE(SUM(CASE WHEN customer_type ILIKE '%non%'
                        THEN total ELSE 0 END), 0)                         AS non_member_revenue,
       COALESCE(SUM(CASE WHEN payment_method ILIKE '%cash%'
                        THEN total ELSE 0 END), 0)                         AS cash_revenue,
       COALESCE(SUM(CASE WHEN payment_method ILIKE '%card%'
                          OR payment_method ILIKE '%eft%'
                          OR payment_method ILIKE '%transfer%'
                        THEN total ELSE 0 END), 0)                         AS card_eft_revenue
     FROM branch_walkin_sales
     WHERE status = 'completed'
       AND sale_date::date = $1::date
     GROUP BY branch_id
     ORDER BY SUM(total) DESC`,
    [targetDate]
  );

  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const totalTransactions = rows.reduce((s, r) => s + Number(r.transaction_count), 0);
  const totalMember = rows.reduce((s, r) => s + Number(r.member_revenue), 0);
  const totalNonMember = rows.reduce((s, r) => s + Number(r.non_member_revenue), 0);

  return res.json({
    success: true,
    date: targetDate,
    summary: {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalTransactions,
      activeBranchCount: rows.length,
      memberRevenue: parseFloat(totalMember.toFixed(2)),
      nonMemberRevenue: parseFloat(totalNonMember.toFixed(2)),
    },
    branches: rows.map(r => ({
      branchId: r.branch_id,
      transactions: Number(r.transaction_count),
      revenue: parseFloat(Number(r.revenue).toFixed(2)),
      memberRevenue: parseFloat(Number(r.member_revenue).toFixed(2)),
      nonMemberRevenue: parseFloat(Number(r.non_member_revenue).toFixed(2)),
      cashRevenue: parseFloat(Number(r.cash_revenue).toFixed(2)),
      cardEftRevenue: parseFloat(Number(r.card_eft_revenue).toFixed(2)),
    })),
  });
}
