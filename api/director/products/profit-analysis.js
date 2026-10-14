/**
 * GET /api/director/products/profit-analysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Frozen sale evidence only. DP, charged receipts and original received cost
 * are separate; no catalogue overlay is permitted on historical results.
 */
import { getDateRange } from '../../services/gmFinanceMisEngine.js';
import { getMany } from '../../db.js';
import {salesEvidenceSql} from '../../services/stockCostReporting.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  if(!req.user)return res.status(401).json({success:false,error:'Authentication required'});
  const { start, end } = getDateRange(req.query);

  const rows = await getMany(
    `${salesEvidenceSql}, valued AS (
       SELECT e.*,(snapshot->>'financial_dp_unit')::numeric*quantity AS dp,
         COALESCE((snapshot->>'revenue_total')::numeric,(snapshot->>'revenue_unit')::numeric*quantity) AS charged,
         COALESCE((SELECT SUM((l->>'quantity')::numeric *
           COALESCE(l->'source'->>'received_unit_cif_exact',l->'source'->>'cif_unit_cost')::numeric)
           FROM jsonb_array_elements(COALESCE(snapshot->'cost_layers','[]'::jsonb)) l),
           (snapshot->>'unit_cost')::numeric*quantity) AS frozen_cost
       FROM evidence e)
     SELECT product_name,SUM(quantity) AS qty_sold,SUM(dp) AS revenue_dp,
       SUM(charged) AS charged_total,SUM(frozen_cost) AS cif_cost,
       SUM(CASE WHEN dp IS NULL THEN quantity ELSE 0 END) AS missing_dp,
       SUM(CASE WHEN snapshot->>'unit_cost' IS NULL THEN quantity ELSE 0 END) AS missing_cost,
       SUM(CASE WHEN charged IS NULL THEN quantity ELSE 0 END) AS missing_charged
     FROM valued
     GROUP BY product_name
     ORDER BY qty_sold DESC`,
    [null, start, end,null]
  );

  const products = rows.map(r => ({
    productName:  r.product_name,
    qtySold:      Number(r.qty_sold   || 0),
    revenueDp:    Number(r.revenue_dp || 0),
    cifCost:      Number(r.cif_cost   || 0),
    chargedTotal:Number(r.charged_total || 0),
    missingDpQuantity:Number(r.missing_dp || 0),
    missingCostQuantity:Number(r.missing_cost || 0),
    missingChargedQuantity:Number(r.missing_charged || 0),
    commercialMargin:Number(r.missing_dp || 0) || Number(r.missing_charged || 0) ? null : Number(r.charged_total)-Number(r.revenue_dp),
    actualProfit:Number(r.missing_cost || 0) || Number(r.missing_charged || 0) ? null : Number(r.charged_total)-Number(r.cif_cost),
  }));

  return res.json({ success: true, period: { start, end }, products });
}
