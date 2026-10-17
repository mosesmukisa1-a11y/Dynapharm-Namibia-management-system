import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { businessDay, validateBusinessDates } from '../../services/businessDates.js';

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

    const dateFrom = url.searchParams.get('date_from') || firstOfMonth;
    const dateTo = url.searchParams.get('date_to') || today;
    validateBusinessDates(dateFrom, dateTo);
    const branchRaw = url.searchParams.get('branch_id') || 'all';
    const branchId = branchRaw === 'all' ? null : branchRaw.toLowerCase().replace(/ /g, '_');

    // ── Campaign references (branch_walkin_sales.data->>'sale_type' = 'campaign_sale') ──
    const campParams = [dateFrom, dateTo];
    let campBranchClause = __qd_registeredPlan("api/reports/branch-sales/product-range.js:34:0");
    if (branchId) {
      campParams.push(branchId);
      campBranchClause = __qd_registeredPlan("api/reports/branch-sales/product-range.js:37:1", [campParams.length]);
    }

    // ── Main BIM params ──
    const movParams = [dateFrom, dateTo];
    let movBranchClause = __qd_registeredPlan("api/reports/branch-sales/product-range.js:42:2");
    if (branchId) {
      movParams.push(branchId);
      movBranchClause = __qd_registeredPlan("api/reports/branch-sales/product-range.js:45:3", [movParams.length]);
    }

    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/reports/branch-sales/product-range.js:48:4", [





    campBranchClause,



















    movBranchClause,



























    movBranchClause]),









    movParams);

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
          missing_dp_qty: 0,
          refunded: Number(r.refund_qty || 0),
          refund_dp: parseFloat(Number(r.refund_dp || 0).toFixed(2))
        };
      }
      const qty = Number(r.total_qty || 0);
      const dp = Number(r.dp_amount || 0);
      prodMap[key].missing_dp_qty += Number(r.missing_dp_qty || 0);
      if (r.sale_type === 'regular') {prodMap[key].walkin += qty;prodMap[key].dp_value += dp;} else
      if (r.sale_type === 'prescription') {prodMap[key].prescription += qty;prodMap[key].dp_value += dp;} else
      if (r.sale_type === 'campaign_paid') {prodMap[key].campaigns += qty;prodMap[key].dp_value += dp;} else
      if (r.sale_type === 'campaign_free') {prodMap[key].free += qty;}
    }

    const products = Object.values(prodMap).map((p) => ({
      ...p,
      total: p.walkin + p.prescription + p.campaigns,
      net: Math.max(0, p.walkin + p.prescription + p.campaigns - p.refunded)
    })).sort((a, b) => b.total - a.total);

    const totals = {
      walkin: products.reduce((s, p) => s + p.walkin, 0),
      prescription: products.reduce((s, p) => s + p.prescription, 0),
      campaigns: products.reduce((s, p) => s + p.campaigns, 0),
      total: products.reduce((s, p) => s + p.total, 0),
      refunded: products.reduce((s, p) => s + p.refunded, 0),
      net: products.reduce((s, p) => s + p.net, 0),
      dp_value: parseFloat(products.reduce((s, p) => s + p.dp_value, 0).toFixed(2)),
      refund_dp: parseFloat(products.reduce((s, p) => s + p.refund_dp, 0).toFixed(2))
    };

    res.json({
      success: true,
      date_from: dateFrom,
      date_to: dateTo,
      branch_id: branchRaw,
      products,
      totals
    });
  } catch (err) {
    console.error('[product-range]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
