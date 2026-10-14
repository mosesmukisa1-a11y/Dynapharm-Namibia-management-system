import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import {businessDay,validateBusinessDates} from '../../services/businessDates.js';

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
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const today = businessDay();
    const firstOfMonth = today.slice(0, 8) + '01';

    const dateFrom   = url.searchParams.get('date_from') || firstOfMonth;
    const dateTo     = url.searchParams.get('date_to')   || today;
    validateBusinessDates(dateFrom,dateTo);
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
        WHERE sale_date >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
          AND sale_date < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
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
          SUM((bim.metadata->'sale_evidence'->>'dp_value')::numeric) AS dp_amount,
          SUM(CASE WHEN bim.metadata->'sale_evidence'->>'dp_value' IS NULL THEN ABS(bim.quantity) ELSE 0 END) AS missing_dp_qty
        FROM branch_inventory_movements bim
        LEFT JOIN campaign_refs cr ON cr.id = bim.reference
        WHERE bim.created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
          AND bim.created_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
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
          SUM(ABS(bim.quantity) * COALESCE(bim.charge_unit, NULLIF(bim.unit_price, 0), NULLIF(pp.dp, 0), 0)) AS refund_dp
        FROM branch_inventory_movements bim
        LEFT JOIN live_product_prices pp ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
        WHERE bim.created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
          AND bim.created_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
          ${movBranchClause}
          AND bim.type = 'refund_return'
        GROUP BY LOWER(TRIM(bim.product_name))
      )
      SELECT a.product_name, a.sale_type, a.total_qty, a.dp_amount,a.missing_dp_qty,
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
          missing_dp_qty:0,
          refunded: Number(r.refund_qty || 0),
          refund_dp: parseFloat(Number(r.refund_dp || 0).toFixed(2)),
        };
      }
      const qty = Number(r.total_qty  || 0);
      const dp  = Number(r.dp_amount  || 0);
      prodMap[key].missing_dp_qty+=Number(r.missing_dp_qty || 0);
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
