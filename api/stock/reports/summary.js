import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const from = url.searchParams.get('date_from') || null;
    const to = url.searchParams.get('date_to') || null;
    const period = url.searchParams.get('period') || null;
    const branchId = url.searchParams.get('branch_id') || null;

    // Precomputed-first: when a specific period is requested, serve stored summary immediately
    if (period) {
      let periodType, periodKey;
      if (/^\d{4}-\d{2}-\d{2}$/.test(period)) { periodType = 'daily'; periodKey = period; }
      else if (/^\d{4}-W\d{2}$/.test(period)) { periodType = 'weekly'; periodKey = period; }
      else if (/^\d{4}-\d{2}$/.test(period)) { periodType = 'monthly'; periodKey = period; }

      if (periodType) {
        const id = branchId
          ? `${periodType}-${periodKey}-${branchId.replace(/[^a-zA-Z0-9_]/g, '_')}`
          : `${periodType}-${periodKey}-all`;
        const stored = await getOne(
          `SELECT report_data, computed_at FROM stock_report_summaries WHERE id = $1`,
          [id]
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

    const [batches, branchInv, sales, movements] = await Promise.all([
      getMany('SELECT location, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price FROM stock_batches'),
      getMany("SELECT location_id, closing_qty, unit_dp, stock_value_dp FROM inventory_balances WHERE location_type = 'branch'"),
      getMany(`SELECT branch_id, total, customer_type FROM branch_walkin_sales WHERE 1=1${dateFilter} LIMIT 5000`, params),
      getMany(`SELECT movement_type, quantity FROM stock_movements WHERE 1=1${dateFilter} LIMIT 5000`, params),
    ]);

    const warehouseQty = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
    const warehouseCIF = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const warehouseDPC = batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);
    const branchQty = branchInv.reduce((s, b) => s + Number(b.closing_qty || 0), 0);
    const branchDPC = branchInv.reduce((s, b) => s + Number(b.stock_value_dp || Number(b.closing_qty || 0) * Number(b.unit_dp || 0)), 0);

    const totalRevenue = sales.reduce((s, r) => s + Number(r.total || 0), 0);

    const receiptUnits = movements.filter(m => ['received', 'receive', 'stock_receipt'].includes(m.movement_type)).reduce((s, m) => s + Number(m.quantity || 0), 0);
    const dispenseUnits = movements.filter(m => ['dispense', 'sale', 'walkin', 'walkin_non_member_sale', 'walkin_member_sale'].includes(m.movement_type)).reduce((s, m) => s + Number(m.quantity || 0), 0);

    res.status(200).json({
      success: true,
      period: { from, to },
      inventory: {
        warehouseQty,
        warehouseCIF: parseFloat(warehouseCIF.toFixed(2)),
        warehouseDPC: parseFloat(warehouseDPC.toFixed(2)),
        branchQty,
        branchDPC: parseFloat(branchDPC.toFixed(2)),
        totalQty: warehouseQty + branchQty,
        totalValueDPC: parseFloat((warehouseDPC + branchDPC).toFixed(2)),
      },
      sales: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        transactionCount: sales.length,
        memberRevenue: parseFloat(sales.filter(s => ['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(s.customer_type)).reduce((sum, s) => sum + Number(s.total || 0), 0).toFixed(2)),
        nonMemberRevenue: parseFloat(sales.filter(s => !['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(s.customer_type)).reduce((sum, s) => sum + Number(s.total || 0), 0).toFixed(2)),
      },
      movements: {
        receiptUnits,
        dispenseUnits,
      },
    });
  } catch (err) {
    console.error('Stock reports summary error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
