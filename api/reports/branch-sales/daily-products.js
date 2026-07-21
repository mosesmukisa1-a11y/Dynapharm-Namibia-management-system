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
          -- dp_amount: revenue at DP level for each movement type.
          --   campaign_sale (member paid): use bim.unit_price which now stores the actual
          --     discounted DP the member paid (paidUnitPrice). For bxgy campaigns this equals
          --     pp.dp; for discount campaigns it is pp.dp × (1-disc%). Falls back to pp.dp
          --     for older records that stored the full list DP.
          --   walk_in_non_member_sale (regular OR campaign non-member): bim.unit_price always
          --     stores the selling CP, never DP. An explicit branch here ensures we never fall
          --     back to bim.unit_price and accidentally use CP as the DP figure — for both
          --     regular rows (where it was always CP) and campaign rows (where it is the
          --     discounted CP after the non-member BIM unit_price fix).
          --   campaign_free_item: always 0 (free, no revenue).
          --   All other types: pp.dp is authoritative; bim.unit_price as last resort fallback.
          SUM(
            ABS(bim.quantity) *
            CASE WHEN bim.type = 'campaign_free_item'      THEN 0
                 WHEN bim.type = 'campaign_sale'
                   THEN COALESCE(NULLIF(bim.unit_price, 0), NULLIF(pp.dp, 0), 0)
                 WHEN bim.type = 'walk_in_non_member_sale'
                   -- bim.unit_price is CP (not DP) for all non-member rows; never use it
                   -- as a DP fallback regardless of whether the row is campaign or regular.
                   THEN COALESCE(NULLIF(pp.dp, 0), 0)
                 ELSE COALESCE(NULLIF(pp.dp, 0), NULLIF(bim.unit_price, 0), 0)
            END
          )                                                                 AS dp_amount,
          -- bv_total: only member-type movements earn BV.
          --   walk_in_non_member_sale (regular & campaign non-member) → 0 BV.
          --   campaign_free_item → 0 BV (free items never earn BV).
          --   All others (member sales, prescriptions) → pp.bv × qty.
          COALESCE(MAX(pp.bv), 0) * SUM(
            CASE WHEN bim.type IN ('campaign_free_item', 'walk_in_non_member_sale') THEN 0
                 ELSE ABS(bim.quantity) END
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
      ),
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
    // Distribute refunded qty/dp across rows for the same product (by sale_type priority:
    // regular first, then campaign_paid, then campaign_free).
    // Strategy: for each product key, apply the refund amount against its rows in order
    // so the "regular" row is reduced first, then campaign rows if needed.
    const refundByKey = new Map();
    for (const r of rows) {
      const pkey = (r.product_name || '').toLowerCase().trim();
      if (!refundByKey.has(pkey)) {
        refundByKey.set(pkey, {
          qty: Number(r.refund_qty || 0),
          dp:  Number(r.refund_dp  || 0),
        });
      }
    }

    // Build net product rows: subtract refund from sold qty/dp, keep only net_qty > 0.
    const netProducts = [];
    let totalRefundQty = 0;
    let totalRefundDp  = 0;
    const seenRefundKeys = new Set();

    // Sort so 'regular' rows come before campaign rows per product (refund applied to regular first).
    const sortedRows = [...rows].sort((a, b) => {
      const order = { regular: 0, campaign_paid: 1, campaign_free: 2 };
      return (order[a.sale_type] ?? 9) - (order[b.sale_type] ?? 9);
    });

    // Track remaining refund budget per product key as we iterate.
    const remainingRefund = new Map();
    for (const [pkey, ref] of refundByKey) {
      remainingRefund.set(pkey, { qty: ref.qty, dp: ref.dp });
      if (!seenRefundKeys.has(pkey)) {
        seenRefundKeys.add(pkey);
        totalRefundQty += ref.qty;
        totalRefundDp  += ref.dp;
      }
    }

    for (const r of sortedRows) {
      const pkey    = (r.product_name || '').toLowerCase().trim();
      const soldQty = Number(r.total_qty  || 0);
      const soldDp  = Number(r.dp_amount  || 0);
      const soldBv  = Number(r.bv_total   || 0);
      const ref     = remainingRefund.get(pkey) || { qty: 0, dp: 0 };

      // Deduct as much refund as this row covers.
      const deductQty = Math.min(ref.qty, soldQty);
      const deductDp  = soldQty > 0 ? (deductQty / soldQty) * soldDp : 0;

      const netQty = soldQty - deductQty;
      const netDp  = soldDp  - deductDp;
      const netBv  = soldQty > 0 ? soldBv * (netQty / soldQty) : 0;

      // Update remaining refund budget for subsequent rows of the same product.
      remainingRefund.set(pkey, {
        qty: ref.qty - deductQty,
        dp:  ref.dp  - deductDp,
      });

      // Only include rows where net qty is positive after refund netting.
      if (netQty > 0) {
        netProducts.push({
          product_name: r.product_name,
          sale_type:    r.sale_type,
          total_qty:    parseFloat(netQty.toFixed(4)),
          dp_amount:    parseFloat(netDp.toFixed(2)),
          bv_total:     parseFloat(netBv.toFixed(2)),
          refund_qty:   Number(r.refund_qty || 0),
          refund_dp:    parseFloat(Number(r.refund_dp  || 0).toFixed(2)),
        });
      }
    }

    const totals = {
      total_qty:  netProducts.reduce((s, r) => s + r.total_qty,  0),
      paid_qty:   netProducts.filter(r => r.sale_type !== 'campaign_free')
                             .reduce((s, r) => s + r.total_qty, 0),
      dp_amount:  parseFloat(netProducts.reduce((s, r) => s + r.dp_amount,  0).toFixed(2)),
      bv_total:   parseFloat(netProducts.reduce((s, r) => s + r.bv_total,   0).toFixed(2)),
      campaign_free_qty: netProducts.filter(r => r.sale_type === 'campaign_free')
                                    .reduce((s, r) => s + r.total_qty, 0),
      refund_qty: totalRefundQty,
      refund_dp:  parseFloat(totalRefundDp.toFixed(2)),
    };

    return res.json({
      success: true,
      date,
      branch_id: branchId || 'all',
      products: netProducts,
      totals,
    });
  } catch (err) {
    console.error('daily-products report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
