import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

/**
 * GET /api/reports/branch-sales/product-range
 * Per-product sales summary for a date range.
 * Source: branch_inventory_movements (same as daily-products.js but multi-day).
 *
 * Query params:
 *   date_from  YYYY-MM-DD  (default: current month start)
 *   date_to    YYYY-MM-DD  (default: today)
 *   branch_id  string | 'all'
 */
export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = today.slice(0, 8) + '01';

    const dateFrom   = url.searchParams.get('date_from') || firstOfMonth;
    const dateTo     = url.searchParams.get('date_to')   || today;
    const branchRaw  = url.searchParams.get('branch_id') || 'all';
    const branchId   = branchRaw === 'all' ? null : branchRaw.toLowerCase().replace(/ /g, '_');

    // ── Campaign references (branch_walkin_sales.data->>'sale_type' = 'campaign_sale') ──
    const campParams = [dateFrom, dateTo];
    let campBranchClause = '';
    if (branchId) {
      campParams.push(branchId);
      campBranchClause = `AND LOWER(REPLACE(branch_id, ' ', '_')) = $${campParams.length}`;
    }

    // ── Main BIM params ──
    const movParams = [dateFrom, dateTo];
    let movBranchClause = '';
    if (branchId) {
      movParams.push(branchId);
      movBranchClause = `AND LOWER(REPLACE(bim.branch_id, ' ', '_')) = $${movParams.length}`;
    }

    const rows = await getMany(`
      WITH campaign_refs AS (
        SELECT id
        FROM branch_walkin_sales
        WHERE DATE(sale_date) >= $1::date
          AND DATE(sale_date) <= $2::date
          ${campBranchClause}
          AND data->>'sale_type' = 'campaign_sale'
      ),
      agg AS (
        SELECT
          MIN(TRIM(bim.product_name))  AS product_name,
          CASE
            WHEN bim.type = 'campaign_free_item'                              THEN 'campaign_free'
            WHEN bim.type = 'campaign_sale'                                   THEN 'campaign_paid'
            WHEN cr.id IS NOT NULL                                            THEN 'campaign_paid'
            WHEN bim.type IN ('prescription_dispense','dispense','field_use') THEN 'prescription'
            ELSE 'regular'
          END                          AS sale_type,
          SUM(ABS(bim.quantity))       AS total_qty,
          SUM(
            ABS(bim.quantity) *
            CASE WHEN bim.type = 'campaign_free_item' THEN 0
                 ELSE COALESCE(NULLIF(pp.dp, 0), NULLIF(bim.unit_price, 0), 0)
            END
          )                            AS dp_amount
        FROM branch_inventory_movements bim
        LEFT JOIN product_prices pp
               ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
        LEFT JOIN campaign_refs cr ON cr.id = bim.reference
        WHERE bim.created_at >= $1::date
          AND bim.created_at  < ($2::date + INTERVAL '1 day')
          ${movBranchClause}
          AND bim.type IN (
            'walk_in_member_sale', 'walk_in_non_member_sale',
            'prescription_dispense', 'sale', 'campaign_sale', 'campaign_free_item',
            'field_use', 'dispense'
          )
        GROUP BY
          LOWER(TRIM(bim.product_name)),
          CASE
            WHEN bim.type = 'campaign_free_item'                              THEN 'campaign_free'
            WHEN bim.type = 'campaign_sale'                                   THEN 'campaign_paid'
            WHEN cr.id IS NOT NULL                                            THEN 'campaign_paid'
            WHEN bim.type IN ('prescription_dispense','dispense','field_use') THEN 'prescription'
            ELSE 'regular'
          END
      )
      SELECT product_name, sale_type, total_qty, dp_amount
      FROM agg
      ORDER BY dp_amount DESC
    `, movParams);

    // Collapse into one row per product with columns per sale_type
    const prodMap = {};
    for (const r of rows) {
      const key = (r.product_name || 'Unknown').toUpperCase();
      if (!prodMap[key]) {
        prodMap[key] = {
          product_name: r.product_name || 'Unknown',
          walkin: 0, prescription: 0, campaigns: 0, free: 0,
          dp_value: 0,
        };
      }
      const qty = Number(r.total_qty  || 0);
      const dp  = Number(r.dp_amount  || 0);
      if      (r.sale_type === 'regular')        { prodMap[key].walkin       += qty; prodMap[key].dp_value += dp; }
      else if (r.sale_type === 'prescription')   { prodMap[key].prescription += qty; prodMap[key].dp_value += dp; }
      else if (r.sale_type === 'campaign_paid')  { prodMap[key].campaigns    += qty; prodMap[key].dp_value += dp; }
      else if (r.sale_type === 'campaign_free')  { prodMap[key].free         += qty; }
    }

    const products = Object.values(prodMap).map(p => ({
      ...p,
      total: p.walkin + p.prescription + p.campaigns,
    })).sort((a, b) => b.total - a.total);

    const totals = {
      walkin:       products.reduce((s, p) => s + p.walkin,       0),
      prescription: products.reduce((s, p) => s + p.prescription, 0),
      campaigns:    products.reduce((s, p) => s + p.campaigns,    0),
      total:        products.reduce((s, p) => s + p.total,        0),
      dp_value:     parseFloat(products.reduce((s, p) => s + p.dp_value, 0).toFixed(2)),
    };

    res.json({
      success: true,
      date_from: dateFrom,
      date_to:   dateTo,
      branch_id: branchRaw,
      products,
      totals,
    });
  } catch (err) {
    console.error('[product-range]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
