/**
 * GET /api/director/branches/revenue-contribution?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Each branch's % share of total company revenue (after refund deductions).
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, salesRows, refundRows] = await Promise.all([
    getAllBranchLocations(),
    getMany(
      `SELECT branch_id, COALESCE(SUM(total),0) as revenue
       FROM branch_walkin_sales
       WHERE status='completed'
         AND sale_date >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek') AND sale_date < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
       GROUP BY branch_id`,
      [start, end]
    ),
    getMany(
      `SELECT branch_id, COALESCE(SUM(refund_amount), 0) AS refund_total
       FROM branch_refund_requests
       WHERE status = 'approved'
         AND processed_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
         AND processed_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
       GROUP BY branch_id`,
      [start, end]
    ),
  ]);

  const branchNameMap = new Map(branchLocations.map(l => [l.locationId, l.locationName]));

  // Build refund map keyed by normalised branch_id
  const refundMap = new Map(refundRows.map(r => [
    (r.branch_id || '').toLowerCase().replace(/ /g, '_'),
    Number(r.refund_total || 0),
  ]));

  const salesMap = new Map(salesRows.map(r => {
    const refund = refundMap.get((r.branch_id || '').toLowerCase().replace(/ /g, '_')) || 0;
    return [r.branch_id, Math.max(0, Number(r.revenue) - refund)];
  }));

  const allBranchIds = new Set([
    ...branchLocations.map(l => l.locationId),
    ...salesRows.map(r => r.branch_id),
  ]);

  let totalRevenue = 0;
  const rows = [...allBranchIds].map(branchId => {
    const salesRevenue = salesMap.get(branchId) || 0;
    totalRevenue += salesRevenue;
    return { branchId, branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId), salesRevenue };
  });

  const result = rows.map(r => ({
    ...r,
    contributionPercent: totalRevenue > 0
      ? Number(((r.salesRevenue / totalRevenue) * 100).toFixed(2))
      : 0,
  }));

  result.sort((a, b) => b.salesRevenue - a.salesRevenue);

  return res.json({ success: true, period: { start, end }, totalRevenue, branches: result });
}
