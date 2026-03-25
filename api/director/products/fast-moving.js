/**
 * GET /api/director/products/fast-moving?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=10
 * Top fast-moving products by units sold.
 */
import { getDateRange } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';

const SALE_TYPES = [
  'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale',
  'walk_in_member_sale', 'walk_in_non_member_sale', 'sale',
  'online_order_fulfilment', 'prescription_dispense',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { start, end } = getDateRange(req.query);
  const limit = Math.min(Number(req.query.limit || 10), 50);

  const rows = await getMany(
    `SELECT sm.product_name,
            SUM(sm.quantity) as units_sold,
            SUM(sm.quantity * COALESCE(sm.unit_dp, 0)) as sales_revenue,
            COUNT(DISTINCT sm.source_location) as branches_active
     FROM stock_movements sm
     WHERE sm.status = 'posted'
       AND sm.movement_type = ANY($1)
       AND sm.created_at >= $2::date
       AND sm.created_at <= ($3 || 'T23:59:59')::timestamp
     GROUP BY sm.product_name
     ORDER BY units_sold DESC
     LIMIT $4`,
    [SALE_TYPES, start, end, limit]
  );

  const products = rows.map((r, i) => ({
    rank: i + 1,
    productId: null,
    productName: r.product_name,
    unitsSold: Number(r.units_sold || 0),
    salesRevenue: Number(r.sales_revenue || 0),
    branchesActive: Number(r.branches_active || 0),
  }));

  return res.json({ success: true, period: { start, end }, products });
}
