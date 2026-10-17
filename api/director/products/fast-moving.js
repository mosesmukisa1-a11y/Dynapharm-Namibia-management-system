import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/products/fast-moving?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=10
 * Top fast-moving products by units sold.
 */
import { getDateRange } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

const SALE_TYPES = [
'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale',
'walk_in_member_sale', 'walk_in_non_member_sale', 'sale',
'online_order_fulfilment', 'prescription_dispense'];


export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);
  const limit = Math.min(Number(req.query.limit || 10), 50);

  const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/director/products/fast-moving.js:21:0"),












  [SALE_TYPES, start, end, limit]);


  const products = rows.map((r, i) => ({
    rank: i + 1,
    productId: null,
    productName: r.product_name,
    unitsSold: Number(r.units_sold || 0),
    salesRevenue: Number(r.sales_revenue || 0),
    branchesActive: Number(r.branches_active || 0)
  }));

  return res.json({ success: true, period: { start, end }, products });
}
