/**
 * GET /api/reports/sales/branch?branchId=branch_cbd&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Branch-level sales report from live completed sales data.
 */
import { getMany, getOne } from '../../db.js';
import { getDateRange } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { branchId } = req.query;
  if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });

  const { start, end } = getDateRange(req.query);

  // Walk-in sales from branch_walkin_sales (completed only)
  const [walkinRows, movRows] = await Promise.all([
    getMany(
      `SELECT customer_type, total, items, data
       FROM branch_walkin_sales
       WHERE branch_id = $1
         AND status = 'completed'
         AND sale_date >= $2::date
         AND sale_date <= ($3 || 'T23:59:59')::timestamp`,
      [branchId, start, end]
    ),
    getMany(
      `SELECT movement_type, quantity, unit_dp
       FROM stock_movements
       WHERE status = 'posted'
         AND source_location = $1
         AND movement_type IN ('prescription_dispense','walkin_sale','walkin_member_sale',
           'walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','sale')
         AND created_at >= $2::date
         AND created_at <= ($3 || 'T23:59:59')::timestamp`,
      [branchId, start, end]
    ),
  ]);

  let walkinSales = 0, memberSales = 0, nonMemberSales = 0, totalUnits = 0;
  let consultationFees = 0, prescriptionSales = 0, onlineSales = 0;
  let transactions = walkinRows.length;

  for (const r of walkinRows) {
    const ct = (r.customer_type || '').toLowerCase();
    // Non-member sales: grand_total is customer price (DP + distributor margin).
    // Use item-level dp × qty to get the true DP value, matching CSI Entry Report.
    let amt;
    const items = Array.isArray(r.items) ? r.items : (r.items ? JSON.parse(r.items) : []);
    if (ct.includes('non') || (!ct.includes('member') && !ct.includes('online'))) {
      let discountPct = 0;
      try { const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); discountPct = Number(d.discount_pct || 0); } catch {}
      amt = items.reduce((s, i) => {
        const listDp = Number(i.dpPrice || i.dp || i.unit_price || 0);
        return s + (discountPct > 0 ? listDp * (1 - discountPct / 100) : listDp) * Number(i.quantity || i.qty || 1);
      }, 0);
    } else {
      amt = Number(r.total || 0);
    }
    walkinSales += amt;
    if (ct.includes('member') && !ct.includes('non')) memberSales += amt;
    else if (ct.includes('online')) onlineSales += amt;
    else nonMemberSales += amt;

    for (const it of items) {
      totalUnits += Number(it.quantity || it.qty || 1);
    }
  }

  for (const m of movRows) {
    const qty = Number(m.quantity || 0);
    if (m.movement_type === 'prescription_dispense') {
      prescriptionSales += qty * Number(m.unit_dp || 0);
    }
    totalUnits += qty;
  }

  const totalSales = walkinSales + prescriptionSales;

  return res.json({
    success: true,
    period: { start, end },
    branchId,
    transactions,
    consultationFees,
    walkinSales,
    memberSales,
    nonMemberSales,
    onlineSales,
    prescriptionSales,
    totalSales,
    totalUnits,
  });
}
