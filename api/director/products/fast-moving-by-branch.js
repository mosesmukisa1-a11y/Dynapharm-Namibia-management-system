import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/products/fast-moving-by-branch?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Top products per branch.
 */
import { getDateRange, getAllBranchLocations, normalizeBranchName } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

const SALE_TYPES = [
'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale',
'walk_in_member_sale', 'walk_in_non_member_sale', 'sale',
'online_order_fulfilment', 'prescription_dispense'];


export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);
  const topN = Math.min(Number(req.query.limit || 5), 20);

  const [branchLocations, rows] = await Promise.all([
  getAllBranchLocations(), __qd_executePlan(
    getMany, __qd_registeredPlan("api/director/products/fast-moving-by-branch.js:23:0"),











    [SALE_TYPES, start, end])]

  );

  const branchNameMap = new Map(branchLocations.map((l) => [l.locationId, l.locationName]));

  const grouped = new Map();
  for (const r of rows) {
    const bid = r.branch_id;
    if (!grouped.has(bid)) grouped.set(bid, []);
    grouped.get(bid).push({
      productId: null,
      productName: r.product_name,
      unitsSold: Number(r.units_sold || 0),
      salesRevenue: Number(r.sales_revenue || 0)
    });
  }

  const result = [];
  for (const [branchId, products] of grouped.entries()) {
    result.push({
      branchId,
      branchName: branchNameMap.get(branchId) || normalizeBranchName(branchId),
      products: products.slice(0, topN)
    });
  }
  result.sort((a, b) => {
    const aRev = a.products.reduce((s, p) => s + p.salesRevenue, 0);
    const bRev = b.products.reduce((s, p) => s + p.salesRevenue, 0);
    return bRev - aRev;
  });

  return res.json({ success: true, period: { start, end }, branches: result });
}
