import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const monthParam = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const [year, month] = monthParam.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ?
    `${year + 1}-01-01` :
    `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const normBranchId = branchId && branchId !== 'all' ?
    branchId.toLowerCase().replace(/ /g, '_') :
    null;

    const params = [monthStart, nextMonth];
    let branchClause = __qd_registeredPlan("api/reports/branch-sales/monthly-products.js:26:2");
    let campSubBranchClause = __qd_registeredPlan("api/reports/branch-sales/monthly-products.js:27:0");
    if (normBranchId) {
      branchClause = __qd_registeredPlan("api/reports/branch-sales/monthly-products.js:29:3", [params.push(normBranchId) && params.length]);
      campSubBranchClause = __qd_registeredPlan("api/reports/branch-sales/monthly-products.js:30:1");
    }

    // Two-CTE approach:
    //  campaign_refs — identifies all campaign sale references (member + non-member)
    //  agg           — aggregates per (normalised product name, sale_type)
    // The outer SELECT can then ORDER BY sale_type as a plain column.
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/monthly-products.js:37:4", [





    campSubBranchClause,


















































    branchClause,























    branchClause]),















    params);

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
          dp: Number(r.refund_dp || 0)
        });
      }
    }

    // Build net product rows: subtract refund from sold qty/dp, keep only net_qty > 0.
    const netProducts = [];
    let totalRefundQty = 0;
    let totalRefundDp = 0;
    const seenRefundKeys = new Set();

    // Sort: regular → prescription → campaign_paid → campaign_free (refund applied to regular first).
    const sortedRows = [...rows].sort((a, b) => {
      const order = { regular: 0, prescription: 1, campaign_paid: 2, campaign_free: 3 };
      return (order[a.sale_type] ?? 9) - (order[b.sale_type] ?? 9);
    });

    // Track remaining refund budget per product key as we iterate.
    const remainingRefund = new Map();
    for (const [pkey, ref] of refundByKey) {
      remainingRefund.set(pkey, { qty: ref.qty, dp: ref.dp });
      if (!seenRefundKeys.has(pkey)) {
        seenRefundKeys.add(pkey);
        totalRefundQty += ref.qty;
        totalRefundDp += ref.dp;
      }
    }

    for (const r of sortedRows) {
      const pkey = (r.product_name || '').toLowerCase().trim();
      const soldQty = Number(r.total_qty || 0);
      const soldDp = Number(r.dp_amount || 0);
      const soldBv = Number(r.bv_total || 0);
      const ref = remainingRefund.get(pkey) || { qty: 0, dp: 0 };

      // Deduct as much refund as this row covers.
      const deductQty = Math.min(ref.qty, soldQty);
      const deductDp = soldQty > 0 ? deductQty / soldQty * soldDp : 0;

      const netQty = soldQty - deductQty;
      const netDp = soldDp - deductDp;
      const netBv = soldQty > 0 ? soldBv * (netQty / soldQty) : 0;

      // Update remaining refund budget for subsequent rows of the same product.
      remainingRefund.set(pkey, {
        qty: ref.qty - deductQty,
        dp: ref.dp - deductDp
      });

      // Only include rows where net qty is positive after refund netting.
      if (netQty > 0) {
        netProducts.push({
          product_name: r.product_name,
          sale_type: r.sale_type,
          total_qty: parseFloat(netQty.toFixed(4)),
          dp_amount: parseFloat(netDp.toFixed(2)),
          bv_total: parseFloat(netBv.toFixed(2)),
          refund_qty: Number(r.refund_qty || 0),
          refund_dp: parseFloat(Number(r.refund_dp || 0).toFixed(2))
        });
      }
    }

    const totals = {
      total_qty: netProducts.reduce((s, r) => s + r.total_qty, 0),
      paid_qty: netProducts.filter((r) => r.sale_type !== 'campaign_free').
      reduce((s, r) => s + r.total_qty, 0),
      dp_amount: parseFloat(netProducts.reduce((s, r) => s + r.dp_amount, 0).toFixed(2)),
      bv_total: parseFloat(netProducts.reduce((s, r) => s + r.bv_total, 0).toFixed(2)),
      // Breakdown totals — mirror the Sales Review columns
      walkin_dp: parseFloat(netProducts.filter((r) => r.sale_type === 'regular').
      reduce((s, r) => s + r.dp_amount, 0).toFixed(2)),
      rx_dp: parseFloat(netProducts.filter((r) => r.sale_type === 'prescription').
      reduce((s, r) => s + r.dp_amount, 0).toFixed(2)),
      campaign_dp: parseFloat(netProducts.filter((r) => r.sale_type === 'campaign_paid').
      reduce((s, r) => s + r.dp_amount, 0).toFixed(2)),
      campaign_free_qty: netProducts.filter((r) => r.sale_type === 'campaign_free').
      reduce((s, r) => s + r.total_qty, 0),
      refund_qty: totalRefundQty,
      refund_dp: parseFloat(totalRefundDp.toFixed(2))
    };

    return res.json({
      success: true,
      month: monthParam,
      branch_id: branchId || 'all',
      products: netProducts,
      totals
    });
  } catch (err) {
    console.error('monthly-products report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
