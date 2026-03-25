/**
 * GET /api/director/branches/revenue-contribution?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Each branch's % share of total company revenue.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, salesRows] = await Promise.all([
    getAllBranchLocations(),
    getMany(
      `SELECT branch_id, COALESCE(SUM(total),0) as revenue
       FROM branch_walkin_sales
       WHERE status='completed'
         AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp
       GROUP BY branch_id`,
      [start, end]
    ),
  ]);

  const branchNameMap = new Map(branchLocations.map(l => [l.locationId, l.locationName]));
  const salesMap = new Map(salesRows.map(r => [r.branch_id, Number(r.revenue)]));

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
