/**
 * GET /api/director/revenue-trends?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Revenue trend summary (orders, walk-ins, product range, avg order value).
 */
import { getDateRange, getAllBranchesSalesRevenue } from '../services/gmFinanceMisEngine.js';
import { getOne } from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);

  const [salesRevenue, orderCount, productRange] = await Promise.all([
    getAllBranchesSalesRevenue(start, end),
    getOne(
      `SELECT COUNT(*) as cnt FROM branch_walkin_sales WHERE status='completed' AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    ),
    getOne(`SELECT COUNT(DISTINCT description) as cnt FROM live_product_prices WHERE catalogue_entry`),
  ]);

  const totalOrders = Number(orderCount?.cnt || 0);
  const totalSalesRevenue = salesRevenue.totalSales;
  const avgOrderValue = totalOrders > 0 ? totalSalesRevenue / totalOrders : 0;

  return res.json({
    success: true,
    period: { start, end },
    totalOrders,
    walkinSalesCount: totalOrders,
    productRange: Number(productRange?.cnt || 0),
    avgOrderValue,
    totalRevenue: totalSalesRevenue,
    memberSales: salesRevenue.memberSales,
    nonMemberSales: salesRevenue.nonMemberSales,
    prescriptionSales: salesRevenue.prescriptionSales,
  });
}
