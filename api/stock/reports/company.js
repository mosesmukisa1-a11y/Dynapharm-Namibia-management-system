import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';
import { canReadCompanyStock,storedFreshness,liveFreshness } from '../../services/stockReportFreshness.js';
import { getStockCostProjection,getSalesCostReport } from '../../services/stockCostReporting.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if(!canReadCompanyStock(req.user))return res.status(403).json({success:false,error:'Company stock reporting access denied'});
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const from = url.searchParams.get('date_from') || null;
    const to = url.searchParams.get('date_to') || null;
    const period = url.searchParams.get('period') || null;

    // Precomputed-first: when a specific period key is requested, serve stored summary
    if (period) {
      let periodType, periodKey;
      if (/^\d{4}-\d{2}-\d{2}$/.test(period)) { periodType = 'daily'; periodKey = period; }
      else if (/^\d{4}-W\d{2}$/.test(period)) { periodType = 'weekly'; periodKey = period; }
      else if (/^\d{4}-\d{2}$/.test(period)) { periodType = 'monthly'; periodKey = period; }

      if (periodType) {
        const stored = await getOne(
          `SELECT report_data, computed_at FROM stock_report_summaries WHERE id = $1`,
          [`${periodType}-${periodKey}-all`]
        ).catch(() => null);
        if (stored && stored.report_data?.cost_basis==='received_batches_v1') {
          const data = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
          const freshness=storedFreshness(stored.computed_at);
          if(freshness.state==='unavailable')return res.status(503).json({success:false,error:freshness.reason,freshness});
          return res.json({ ...data,success: true, source: 'precomputed', period_type: periodType, period_key: periodKey, computed_at: stored.computed_at,freshness });
        }
      }
      return res.status(503).json({success:false,error:'Requested stock summary is unavailable; no unbounded current-data substitution',freshness:{state:'unavailable'},period});
    }

    let dateFilter = '';
    const params = [];
    if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}`; }
    if (to) { params.push(to + 'T23:59:59'); dateFilter += ` AND created_at <= $${params.length}`; }

    const [stock,originalSales,sales] = await Promise.all([
      getStockCostProjection(),getSalesCostReport({from,to}),
      getMany(`SELECT branch_id, total, customer_type, created_at FROM branch_walkin_sales WHERE 1=1${dateFilter} LIMIT 10000`, params),
    ]);

    const warehouseCIF = stock.reduce((sum,r)=>sum+r.qty*(r.unitCIF ?? 0),0);
    const warehouseDPC = stock.reduce((sum,r)=>sum+r.qty*(r.unitDPC ?? 0),0);
    const branchDPC = 0;
    const totalRevenue = sales.reduce((s, r) => s + Number(r.total || 0), 0);
    const markup = warehouseCIF > 0 ? ((warehouseDPC - warehouseCIF) / warehouseCIF * 100) : 0;

    const byBranch = {};
    sales.forEach(s => {
      if (!byBranch[s.branch_id]) byBranch[s.branch_id] = { branchId: s.branch_id, revenue: 0, transactions: 0 };
      byBranch[s.branch_id].revenue += Number(s.total || 0);
      byBranch[s.branch_id].transactions += 1;
    });

    res.status(200).json({
      success: true,
      freshness:liveFreshness(),
      cost_basis:'received_batches_v1',
      missingCostQuantity:stock.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      missingDPCQuantity:stock.reduce((sum,r)=>sum+r.missingDPCQuantity,0),
      valuationComplete:stock.every(r=>!r.missingCostQuantity && !r.missingDPCQuantity),
      knownSalesCost:originalSales.reduce((sum,r)=>sum+r.knownCost,0),
      missingSalesCostQuantity:originalSales.reduce((sum,r)=>sum+r.missingCostQuantity,0),
      grossProfit:originalSales.some(r=>r.grossProfit==null) ? null : originalSales.reduce((sum,r)=>sum+r.grossProfit,0),
      period: { from, to },
      totalStockValueCIF: parseFloat(warehouseCIF.toFixed(2)),
      totalStockValueDPC: parseFloat((warehouseDPC + branchDPC).toFixed(2)),
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      averageMarkup:stock.some(r=>r.missingCostQuantity || r.missingDPCQuantity) ? null : parseFloat(markup.toFixed(1)),
      branchBreakdown: Object.values(byBranch).sort((a, b) => b.revenue - a.revenue).map(b => ({
        ...b,
        revenue: parseFloat(b.revenue.toFixed(2)),
        branchName: (b.branchId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      })),
    });
  } catch (err) {
    console.error('Company report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
