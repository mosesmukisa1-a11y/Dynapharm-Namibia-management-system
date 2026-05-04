import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const normBranchId = branchId && branchId !== 'all'
      ? branchId.toLowerCase().replace(/ /g, '_')
      : null;

    const params = [date];
    let branchClause = '';
    if (normBranchId) {
      branchClause = ` AND LOWER(REPLACE(bim.branch_id, ' ', '_')) = $${params.push(normBranchId) && params.length}`;
    }

    const rows = await getMany(`
      SELECT
        bim.product_name,
        SUM(ABS(bim.quantity))                                              AS total_qty,
        SUM(ABS(bim.quantity) * COALESCE(bim.unit_price, 0))               AS dp_amount,
        COALESCE(MAX(pp.bv), 0) * SUM(
          CASE WHEN bim.type = 'campaign_free_item' THEN 0 ELSE ABS(bim.quantity) END
        )                                                                   AS bv_total
      FROM branch_inventory_movements bim
      LEFT JOIN product_prices pp
             ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
      WHERE DATE(bim.created_at) = $1::date
        AND bim.type IN (
          'walk_in_member_sale', 'walk_in_non_member_sale',
          'prescription_dispense', 'sale', 'campaign_sale', 'campaign_free_item',
          'field_use', 'dispense'
        )
        ${branchClause}
      GROUP BY bim.product_name
      ORDER BY dp_amount DESC
    `, params);

    const totals = {
      total_qty:  rows.reduce((s, r) => s + Number(r.total_qty  || 0), 0),
      dp_amount:  parseFloat(rows.reduce((s, r) => s + Number(r.dp_amount  || 0), 0).toFixed(2)),
      bv_total:   parseFloat(rows.reduce((s, r) => s + Number(r.bv_total   || 0), 0).toFixed(2)),
    };

    return res.json({
      success: true,
      date,
      branch_id: branchId || 'all',
      products: rows.map(r => ({
        product_name: r.product_name,
        total_qty:    Number(r.total_qty  || 0),
        dp_amount:    parseFloat(Number(r.dp_amount  || 0).toFixed(2)),
        bv_total:     parseFloat(Number(r.bv_total   || 0).toFixed(2)),
      })),
      totals,
    });
  } catch (err) {
    console.error('daily-products report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
