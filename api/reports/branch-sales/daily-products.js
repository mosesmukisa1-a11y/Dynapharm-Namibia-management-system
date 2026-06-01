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
    let campSubBranchClause = '';
    if (normBranchId) {
      branchClause = ` AND LOWER(REPLACE(bim.branch_id, ' ', '_')) = $${params.push(normBranchId) && params.length}`;
      // Same $2 param used in the CTE subquery
      campSubBranchClause = `AND LOWER(REPLACE(branch_id, ' ', '_')) = $2`;
    }

    // Two-CTE approach:
    //  campaign_refs — identifies all campaign sale references (member + non-member)
    //  agg           — aggregates per (normalised product name, sale_type)
    // The outer SELECT can then ORDER BY sale_type as a plain column.
    const rows = await getMany(`
      WITH campaign_refs AS (
        SELECT id FROM branch_walkin_sales
        WHERE DATE(sale_date) = $1::date
          ${campSubBranchClause}
          AND data->>'sale_type' = 'campaign_sale'
      ),
      agg AS (
        SELECT
          MIN(TRIM(bim.product_name))                                       AS product_name,
          CASE
            WHEN bim.type = 'campaign_free_item' THEN 'campaign_free'
            WHEN bim.type = 'campaign_sale'      THEN 'campaign_paid'
            WHEN cr.id   IS NOT NULL             THEN 'campaign_paid'
            ELSE                                      'regular'
          END                                                               AS sale_type,
          SUM(ABS(bim.quantity))                                            AS total_qty,
          -- Use product_prices.dp (GM price list) as the authoritative DP source.
          -- bim.unit_price stores CP for non-member walk-in sales, so it cannot be
          -- used directly. Free items (campaign_free_item) are always 0.
          SUM(
            ABS(bim.quantity) *
            CASE WHEN bim.type = 'campaign_free_item' THEN 0
                 ELSE COALESCE(NULLIF(pp.dp, 0), NULLIF(bim.unit_price, 0), 0)
            END
          )                                                                 AS dp_amount,
          COALESCE(MAX(pp.bv), 0) * SUM(
            CASE WHEN bim.type = 'campaign_free_item' THEN 0 ELSE ABS(bim.quantity) END
          )                                                                 AS bv_total
        FROM branch_inventory_movements bim
        LEFT JOIN product_prices pp
               ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
        LEFT JOIN campaign_refs cr ON cr.id = bim.reference
        WHERE DATE(bim.created_at) = $1::date
          AND bim.type IN (
            'walk_in_member_sale', 'walk_in_non_member_sale',
            'prescription_dispense', 'sale', 'campaign_sale', 'campaign_free_item',
            'field_use', 'dispense'
          )
          ${branchClause}
        GROUP BY
          LOWER(TRIM(bim.product_name)),
          CASE
            WHEN bim.type = 'campaign_free_item' THEN 'campaign_free'
            WHEN bim.type = 'campaign_sale'      THEN 'campaign_paid'
            WHEN cr.id   IS NOT NULL             THEN 'campaign_paid'
            ELSE                                      'regular'
          END
      )
      -- Approved refunds on this date (recognised on approval date)
      refund_agg AS (
        SELECT
          LOWER(TRIM(bim.product_name))                                          AS pkey,
          SUM(ABS(bim.quantity))                                                 AS refund_qty,
          SUM(ABS(bim.quantity) * COALESCE(NULLIF(pp.dp, 0), NULLIF(bim.unit_price, 0), 0)) AS refund_dp
        FROM branch_inventory_movements bim
        LEFT JOIN product_prices pp ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
        WHERE DATE(bim.created_at) = $1::date
          AND bim.type = 'refund_return'
          ${branchClause}
        GROUP BY LOWER(TRIM(bim.product_name))
      )
      SELECT a.product_name, a.sale_type, a.total_qty, a.dp_amount, a.bv_total,
             COALESCE(r.refund_qty, 0) AS refund_qty,
             COALESCE(r.refund_dp,  0) AS refund_dp
      FROM agg a
      LEFT JOIN refund_agg r ON r.pkey = LOWER(TRIM(a.product_name))
      ORDER BY
        CASE a.sale_type WHEN 'regular' THEN 0 WHEN 'campaign_paid' THEN 1 ELSE 2 END,
        a.dp_amount DESC
    `, params);

    // Totals: dp_amount and bv_total are already 0 for free items (unit_price = NULL).
    // total_qty includes ALL movements (qty of stock actually deducted).
    // paid_qty excludes free items so the sales count is accurate.
    // Aggregate refund totals — each product row has the same refund_qty (from the LEFT JOIN),
    // so deduplicate by product name before summing refunds.
    const seenRefundKeys = new Set();
    let totalRefundQty = 0;
    let totalRefundDp  = 0;
    for (const r of rows) {
      const pkey = (r.product_name || '').toLowerCase().trim();
      if (!seenRefundKeys.has(pkey)) {
        seenRefundKeys.add(pkey);
        totalRefundQty += Number(r.refund_qty || 0);
        totalRefundDp  += Number(r.refund_dp  || 0);
      }
    }

    const totals = {
      total_qty:  rows.reduce((s, r) => s + Number(r.total_qty  || 0), 0),
      paid_qty:   rows.filter(r => r.sale_type !== 'campaign_free')
                      .reduce((s, r) => s + Number(r.total_qty  || 0), 0),
      dp_amount:  parseFloat(rows.reduce((s, r) => s + Number(r.dp_amount  || 0), 0).toFixed(2)),
      bv_total:   parseFloat(rows.reduce((s, r) => s + Number(r.bv_total   || 0), 0).toFixed(2)),
      campaign_free_qty: rows.filter(r => r.sale_type === 'campaign_free')
                             .reduce((s, r) => s + Number(r.total_qty || 0), 0),
      refund_qty: totalRefundQty,
      refund_dp:  parseFloat(totalRefundDp.toFixed(2)),
    };

    return res.json({
      success: true,
      date,
      branch_id: branchId || 'all',
      products: rows.map(r => ({
        product_name: r.product_name,
        sale_type:    r.sale_type,
        total_qty:    Number(r.total_qty  || 0),
        dp_amount:    parseFloat(Number(r.dp_amount  || 0).toFixed(2)),
        bv_total:     parseFloat(Number(r.bv_total   || 0).toFixed(2)),
        refund_qty:   Number(r.refund_qty || 0),
        refund_dp:    parseFloat(Number(r.refund_dp  || 0).toFixed(2)),
      })),
      totals,
    });
  } catch (err) {
    console.error('daily-products report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
