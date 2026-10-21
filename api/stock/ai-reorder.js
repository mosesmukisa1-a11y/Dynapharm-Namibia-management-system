import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { getStockCostProjection } from '../services/stockCostReporting.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const days = Number(url.searchParams.get('days') ?? '30');
    const branchId = url.searchParams.get('branchId') || 'all';
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'days must be 1–365' });
    const scope = getBranchScope(req.user);
    const terms = branchId === 'all' ? null : branchSearchTerms(branchId);
    if (scope.enforced && (!terms || !scope.branches.some((b) => branchSearchTerms(b).some((t) => terms.includes(t)))))
    return res.status(403).json({ error: 'Branch access denied' });
    if (!scope.enforced && !['admin', 'gm', 'director', 'stock', 'finance', 'warehouse'].includes(req.user.role))
    return res.status(403).json({ error: 'Stock reporting access required' });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [branchInv, movements] = await Promise.all([
    getStockCostProjection({ branchOnly: true }), __qd_executePlan(
      getMany, __qd_registeredPlan("api/stock/ai-reorder.js:28:0"),


      [since, new Date().toISOString(), terms?.map((t) => t.replace(/_/g, ' ').toLowerCase()) || null])]
    );

    const salesByProduct = {};
    movements.forEach((m) => {
      {
        const name = m.product_name || 'Unknown';
        if (!salesByProduct[name]) salesByProduct[name] = 0;
        salesByProduct[name] += Number(m.quantity || 0);
      }
    });

    const invByProduct = {};
    branchInv.forEach((b) => {
      if (terms && !branchSearchTerms(b.location).some((t) => terms.includes(t))) return;
      const name = b.productName;
      if (!invByProduct[name]) invByProduct[name] = { totalQty: 0, locations: [] };
      invByProduct[name].totalQty += Number(b.availableQty || 0);
      invByProduct[name].locations.push(b.location);
    });
    for (const name of Object.keys(salesByProduct)) {
      if (!invByProduct[name]) invByProduct[name] = { totalQty: 0, locations: [] };
    }

    const suggestions = Object.entries(invByProduct).
    map(([name, inv]) => {
      const totalSales = salesByProduct[name] || 0;
      const avgDailyUsage = totalSales / days;
      const daysRemaining = inv.totalQty <= 0 ? 0 : avgDailyUsage > 0 ? inv.totalQty / avgDailyUsage : 999;
      // Surface evidence for manual review; no unapproved stocking target.
      return {
        productName: name,
        currentQty: inv.totalQty,
        avgDailyUsage: parseFloat(avgDailyUsage.toFixed(2)),
        daysRemaining: parseFloat(Math.min(daysRemaining, 999).toFixed(1)),
        monthsRemaining: parseFloat(Math.min(daysRemaining / 30, 99).toFixed(1)),
        recommendedReorderQty: null,
        recommendationStatus: 'manual_review',
        recommendationReason: 'No approved automatic reorder quantity policy configured',
        demandBasis: 'Gross allocated sale units; unallocated legacy sales excluded',
        locations: inv.locations,
        urgency: daysRemaining <= 0 ? 'out_of_stock' :
        daysRemaining < 14 ? 'critical' :
        daysRemaining < 30 ? 'urgent' :
        daysRemaining < 90 ? 'reorder_now' :
        'plan_ahead'
      };
    }).
    filter(Boolean).
    sort((a, b) => a.daysRemaining - b.daysRemaining);

    res.status(200).json({ success: true, suggestions, period: `${days} days`, branchId });
  } catch (err) {
    console.error('AI reorder error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
