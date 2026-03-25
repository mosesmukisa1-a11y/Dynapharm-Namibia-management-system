/**
 * GET /api/director/branches/fast-moving?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Branches ranked by sales units, revenue, and gross profit.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [branchLocations, salesRows, cifRows] = await Promise.all([
    getAllBranchLocations(),
    getMany(
      `SELECT branch_id, COALESCE(SUM(total),0) as revenue, COUNT(*) as txns
       FROM branch_walkin_sales
       WHERE status='completed'
         AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp
       GROUP BY branch_id`,
      [start, end]
    ),
    getMany(
      `SELECT sm.source_location as branch_id,
              SUM(sm.quantity) as units_sold,
              SUM(sm.quantity * COALESCE(pp.cif, 0)) as cif_cost
       FROM stock_movements sm
       LEFT JOIN product_prices pp ON sm.product_name = pp.description
       WHERE sm.status = 'posted'
         AND sm.movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale',
           'walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense')
         AND sm.created_at >= $1::date
         AND sm.created_at <= ($2 || 'T23:59:59')::timestamp
       GROUP BY sm.source_location`,
      [start, end]
    ),
  ]);

  const branchNameMap = new Map(branchLocations.map(l => [l.locationId, l.locationName]));
  const salesMap = new Map(salesRows.map(r => [r.branch_id, Number(r.revenue)]));
  const cifMap = new Map(cifRows.map(r => [r.branch_id, { units: Number(r.units_sold || 0), cif: Number(r.cif_cost || 0) }]));

  const allBranchIds = new Set([
    ...branchLocations.map(l => l.locationId),
    ...salesRows.map(r => r.branch_id),
    ...cifRows.map(r => r.branch_id),
  ]);

  const result = [...allBranchIds].map(branchId => {
    const salesRevenue = salesMap.get(branchId) || 0;
    const stats = cifMap.get(branchId) || { units: 0, cif: 0 };
    const grossProfit = salesRevenue - stats.cif;
    return {
      branchId,
      branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId),
      salesUnits: stats.units,
      salesRevenue,
      grossProfit,
    };
  });

  result.sort((a, b) => b.salesRevenue - a.salesRevenue);

  return res.json({ success: true, period: { start, end }, branches: result });
}
