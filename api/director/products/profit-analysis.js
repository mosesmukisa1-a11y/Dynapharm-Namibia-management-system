/**
 * GET /api/director/products/profit-analysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns qty_sold per product from stock_movements (date-filtered, all sale types).
 * Frontend overlays CIF/DP from the live price list for per-unit margin calculations.
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

  const rows = await getMany(
    `SELECT
       sm.product_name,
       SUM(sm.quantity)::int                                     AS qty_sold,
       SUM(sm.quantity * COALESCE(sm.unit_dp,  0))              AS revenue_dp,
       SUM(sm.quantity * COALESCE(sm.unit_cif, pp.cif, 0))      AS cif_cost
     FROM stock_movements sm
     LEFT JOIN live_product_prices pp
       ON LOWER(TRIM(sm.product_name)) = LOWER(TRIM(pp.description))
     WHERE sm.status = 'posted'
       AND sm.movement_type = ANY($1)
       AND sm.created_at >= $2::date
       AND sm.created_at <= ($3 || 'T23:59:59')::timestamp
     GROUP BY sm.product_name
     ORDER BY qty_sold DESC`,
    [SALE_TYPES, start, end]
  );

  const products = rows.map(r => ({
    productName:  r.product_name,
    qtySold:      Number(r.qty_sold   || 0),
    revenueDp:    Number(r.revenue_dp || 0),
    cifCost:      Number(r.cif_cost   || 0),
  }));

  return res.json({ success: true, period: { start, end }, products });
}
