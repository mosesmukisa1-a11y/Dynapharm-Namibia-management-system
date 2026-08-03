import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
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
        if (stored) {
          const data = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
          return res.json({ success: true, source: 'precomputed', period_type: periodType, period_key: periodKey, computed_at: stored.computed_at, ...data });
        }
      }
    }

    let dateFilter = '';
    const params = [];
    if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}`; }
    if (to) { params.push(to + 'T23:59:59'); dateFilter += ` AND created_at <= $${params.length}`; }

    const [batches, branchInv, sales] = await Promise.all([
      getMany("SELECT location, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price FROM stock_batches WHERE location != 'country_stock' AND remaining_quantity > 0 AND COALESCE(status,'') != 'expired'"),
      getMany("SELECT location_id, closing_qty, unit_dp, stock_value_dp FROM inventory_balances WHERE location_type = 'branch'"),
      getMany(`SELECT branch_id, total, customer_type, created_at FROM branch_walkin_sales WHERE 1=1${dateFilter} LIMIT 10000`, params),
    ]);

    const warehouseCIF = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const warehouseDPC = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);
    const branchDPC = branchInv.reduce((s, b) => s + Number(b.stock_value_dp || 0), 0);
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
      period: { from, to },
      totalStockValueCIF: parseFloat(warehouseCIF.toFixed(2)),
      totalStockValueDPC: parseFloat((warehouseDPC + branchDPC).toFixed(2)),
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      averageMarkup: parseFloat(markup.toFixed(1)),
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
