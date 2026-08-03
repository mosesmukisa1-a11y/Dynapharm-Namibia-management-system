import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url      = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const from     = url.searchParams.get('date_from') || null;
    const to       = url.searchParams.get('date_to')   || null;
    const period   = url.searchParams.get('period')    || null;
    const branchId = url.searchParams.get('branch_id') || null;

    // Precomputed-first: when a specific period is requested, serve stored summary immediately
    if (period) {
      let periodType, periodKey;
      if (/^\d{4}-\d{2}-\d{2}$/.test(period)) { periodType = 'daily';   periodKey = period; }
      else if (/^\d{4}-W\d{2}$/.test(period))  { periodType = 'weekly';  periodKey = period; }
      else if (/^\d{4}-\d{2}$/.test(period))   { periodType = 'monthly'; periodKey = period; }

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
    if (from) { params.push(from);               dateFilter += ` AND created_at >= $${params.length}`; }
    if (to)   { params.push(to + 'T23:59:59');   dateFilter += ` AND created_at <= $${params.length}`; }

    // Sales and movement aggregates are computed in SQL to avoid LIMIT-truncation
    // issues when there are large numbers of transactions in the period.
    const salesParams2  = [...params];
    const movParams2    = [...params];

    const [batches, branchInv, salesAgg, movAgg] = await Promise.all([
      // Only fetch batches with stock remaining — avoids the 0||quantity fallback bug.
      // Country stock excluded: it is a staging/holding area, not active operations.
      getMany(`SELECT location, remaining_quantity, cif_unit_cost, dpc_unit_value, unit_price
               FROM stock_batches
               WHERE remaining_quantity > 0
                 AND COALESCE(status, '') != 'expired'
                 AND location != 'country_stock'`),
      getMany(`SELECT bib.branch_id AS location_id,
                      SUM(bib.quantity)                        AS closing_qty,
                      MAX(COALESCE(p.dp,  0))                  AS unit_dp,
                      SUM(bib.quantity * COALESCE(p.dp,  0))   AS stock_value_dp
               FROM branch_inventory_batches bib
               LEFT JOIN product_prices p
                      ON LOWER(TRIM(p.description)) = LOWER(TRIM(bib.product_name))
               WHERE bib.quantity > 0
               GROUP BY bib.branch_id`),
      // Aggregate in SQL — no row-count cap
      getMany(
        `SELECT customer_type,
                COUNT(*)       AS tx_count,
                SUM(total)     AS total_revenue
         FROM branch_walkin_sales
         WHERE 1=1${dateFilter}
         GROUP BY customer_type`,
        salesParams2
      ),
      getMany(
        `SELECT movement_type, SUM(quantity) AS total_qty
         FROM stock_movements
         WHERE 1=1${dateFilter}
         GROUP BY movement_type`,
        movParams2
      ),
    ]);

    const warehouseQty = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
    const warehouseCIF = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0);
    const warehouseDPC = batches.reduce((s, b) => s + Number(b.remaining_quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0), 0);
    const branchQty    = branchInv.reduce((s, b) => s + Number(b.closing_qty || 0), 0);
    const branchDPC    = branchInv.reduce((s, b) => s + Number(b.stock_value_dp || Number(b.closing_qty || 0) * Number(b.unit_dp || 0)), 0);

    const totalRevenue       = salesAgg.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const transactionCount   = salesAgg.reduce((s, r) => s + Number(r.tx_count || 0), 0);
    const memberRevenue      = salesAgg.filter(r => ['member','walk_in_member_sale','walkin_member_sale'].includes(r.customer_type)).reduce((s, r) => s + Number(r.total_revenue || 0), 0);
    const nonMemberRevenue   = salesAgg.filter(r => !['member','walk_in_member_sale','walkin_member_sale'].includes(r.customer_type)).reduce((s, r) => s + Number(r.total_revenue || 0), 0);

    const receiptTypes   = new Set(['received','receive','stock_receipt']);
    const dispenseTypes  = new Set(['dispense','sale','walkin','walkin_non_member_sale','walkin_member_sale']);
    const receiptUnits   = movAgg.filter(m => receiptTypes.has(m.movement_type)).reduce((s, m) => s + Number(m.total_qty || 0), 0);
    const dispenseUnits  = movAgg.filter(m => dispenseTypes.has(m.movement_type)).reduce((s, m) => s + Number(m.total_qty || 0), 0);

    res.status(200).json({
      success: true,
      period: { from, to },
      inventory: {
        warehouseQty,
        warehouseCIF:   parseFloat(warehouseCIF.toFixed(2)),
        warehouseDPC:   parseFloat(warehouseDPC.toFixed(2)),
        branchQty,
        branchDPC:      parseFloat(branchDPC.toFixed(2)),
        totalQty:       warehouseQty + branchQty,
        totalValueDPC:  parseFloat((warehouseDPC + branchDPC).toFixed(2)),
      },
      sales: {
        totalRevenue:     parseFloat(totalRevenue.toFixed(2)),
        transactionCount,
        memberRevenue:    parseFloat(memberRevenue.toFixed(2)),
        nonMemberRevenue: parseFloat(nonMemberRevenue.toFixed(2)),
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
