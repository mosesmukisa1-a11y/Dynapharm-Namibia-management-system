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
        SELECT id, COALESCE(NULLIF((data->>'discount_pct')::numeric, 0), 0) AS discount_pct
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
            -- dp_amount guard: bim.unit_price stores CP (not DP) for walk_in_non_member_sale
            -- rows (both regular and campaign non-member). Never use it as a DP fallback for
            -- those rows or the product-range report will show inflated DP figures. Mirror of
            -- the same guard in daily-products.js.
            CASE WHEN bim.type = 'campaign_free_item'      THEN 0
                 WHEN bim.type = 'walk_in_non_member_sale' AND COALESCE(cr.discount_pct, 0) > 0
                   -- Non-member discount campaign: apply discount_pct from campaign_refs CTE.
                   THEN COALESCE(NULLIF(ROUND(pp.dp * (1 - cr.discount_pct / 100), 2), 0), NULLIF(pp.dp, 0), 0)
                 WHEN bim.type = 'walk_in_non_member_sale'
                   -- bxgy or regular: list DP (unit_price stores CP, not DP).
                   THEN COALESCE(NULLIF(pp.dp, 0), 0)
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
      ),
      -- Approved refund returns within the same period (recognised on approval date)
      refund_agg AS (
        SELECT
          LOWER(TRIM(bim.product_name))                                          AS pkey,
          SUM(ABS(bim.quantity))                                                 AS refund_qty,
          -- Use bim.unit_price first: it stores the ACTUAL refunded (campaign) price.
          -- Fall back to pp.dp only when bim.unit_price is 0/null (legacy entries).
          SUM(ABS(bim.quantity) * COALESCE(NULLIF(bim.unit_price, 0), NULLIF(pp.dp, 0), 0)) AS refund_dp
        FROM branch_inventory_movements bim
        LEFT JOIN product_prices pp ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
        WHERE bim.created_at >= $1::date
          AND bim.created_at  < ($2::date + INTERVAL '1 day')
          ${movBranchClause}
          AND bim.type = 'refund_return'
        GROUP BY LOWER(TRIM(bim.product_name))
      )
      SELECT a.product_name, a.sale_type, a.total_qty, a.dp_amount,
             COALESCE(r.refund_qty, 0) AS refund_qty,
             COALESCE(r.refund_dp,  0) AS refund_dp
      FROM agg a
      LEFT JOIN refund_agg r ON r.pkey = LOWER(TRIM(a.product_name))
      ORDER BY a.dp_amount DESC
    `, movParams);

    // Collapse into one row per product with columns per sale_type
    // refund_qty / refund_dp come from the refund_agg CTE — same value on every
    // row for a given product (because the LEFT JOIN duplicates them per sale_type).
    const prodMap = {};
    for (const r of rows) {
      const key = (r.product_name || 'Unknown').toUpperCase();
      if (!prodMap[key]) {
        prodMap[key] = {
          product_name: r.product_name || 'Unknown',
          walkin: 0, prescription: 0, campaigns: 0, free: 0,
          dp_value: 0,
          refunded: Number(r.refund_qty || 0),
          refund_dp: parseFloat(Number(r.refund_dp || 0).toFixed(2)),
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
      net:   Math.max(0, p.walkin + p.prescription + p.campaigns - p.refunded),
    })).sort((a, b) => b.total - a.total);

    const totals = {
      walkin:       products.reduce((s, p) => s + p.walkin,       0),
      prescription: products.reduce((s, p) => s + p.prescription, 0),
      campaigns:    products.reduce((s, p) => s + p.campaigns,    0),
      total:        products.reduce((s, p) => s + p.total,        0),
      refunded:     products.reduce((s, p) => s + p.refunded,     0),
      net:          products.reduce((s, p) => s + p.net,          0),
      dp_value:     parseFloat(products.reduce((s, p) => s + p.dp_value,  0).toFixed(2)),
      refund_dp:    parseFloat(products.reduce((s, p) => s + p.refund_dp, 0).toFixed(2)),
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
