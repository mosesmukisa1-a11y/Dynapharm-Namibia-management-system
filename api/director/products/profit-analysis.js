import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * GET /api/director/products/profit-analysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Frozen sale evidence only. DP, charged receipts and original received cost
 * are separate; no catalogue overlay is permitted on historical results.
 */
import { getDateRange } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';
import { salesEvidenceSql } from '../../services/stockCostReporting.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const { start, end } = getDateRange(req.query);

  const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/director/products/profit-analysis.js:17:0"),
















  [null, start, end, null]);


  const products = rows.map((r) => ({
    productName: r.product_name,
    qtySold: Number(r.qty_sold || 0),
    revenueDp: Number(r.revenue_dp || 0),
    cifCost: Number(r.cif_cost || 0),
    chargedTotal: Number(r.charged_total || 0),
    missingDpQuantity: Number(r.missing_dp || 0),
    missingCostQuantity: Number(r.missing_cost || 0),
    missingChargedQuantity: Number(r.missing_charged || 0),
    commercialMargin: Number(r.missing_dp || 0) || Number(r.missing_charged || 0) ? null : Number(r.charged_total) - Number(r.revenue_dp),
    actualProfit: Number(r.missing_cost || 0) || Number(r.missing_charged || 0) ? null : Number(r.charged_total) - Number(r.cif_cost)
  }));

  return res.json({ success: true, period: { start, end }, products });
}
