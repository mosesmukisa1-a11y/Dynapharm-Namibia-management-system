import { applyAuthCors } from '../../_lib/auth.js';
import { getMany, getOne } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branch_id') || '';
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const conds = [`service_date = $1`];
    const params = [date];
    if (branchId && branchId !== 'all') {
      conds.push(`branch_id = $${params.length + 1}`);
      params.push(branchId);
    }

    const movConds = [`DATE(created_at) = $1`];
    const movParams = [date];
    if (branchId && branchId !== 'all') {
      movConds.push(`branch_id = $${movParams.length + 1}`);
      movParams.push(branchId);
    }

    const [txRows, visitRows, rxProductMovements] = await Promise.all([
      getMany(
        `SELECT * FROM branch_activity_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at ASC`,
        params
      ),
      getMany(
        `SELECT * FROM branch_client_visits WHERE checkin_time::date = $1${branchId && branchId !== 'all' ? ' AND branch_id = $2' : ''} ORDER BY checkin_time ASC`,
        branchId && branchId !== 'all' ? [date, branchId] : [date]
      ),
      // Per-product dispense movements for the day, keyed by reference (form_reference_id)
      getMany(
        `SELECT reference as form_reference_id, product_name, batch_no,
                SUM(ABS(quantity)) as qty,
                SUM(ABS(quantity) * COALESCE(unit_price, 0)) as dp_value
         FROM branch_inventory_movements
         WHERE ${movConds.join(' AND ')} AND type IN ('prescription_dispense','dispense','field_use')
         GROUP BY reference, product_name, batch_no`,
        movParams
      ),
    ]);

    // Group per-product movements by form_reference_id for Rx detail lookup
    const rxProductMap = {};
    for (const m of rxProductMovements) {
      const ref = m.form_reference_id || 'unknown';
      if (!rxProductMap[ref]) rxProductMap[ref] = [];
      rxProductMap[ref].push({
        product_name: m.product_name,
        batch_no: m.batch_no,
        qty: Number(m.qty || 0),
        dp_value: parseFloat(Number(m.dp_value || 0).toFixed(2)),
      });
    }

    const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
    const paidRows = (rows) => rows.filter(r => r.payment_status === 'paid');
    const pendingRows = (rows) => rows.filter(r => r.payment_status !== 'paid');

    const consultRows = txRows.filter(r => ['consultation', 'full_body_checkup'].includes(r.activity_type));
    const walkinRows = txRows.filter(r => r.activity_type === 'walkin_sale');
    const memberRows = txRows.filter(r => r.activity_type === 'member_sale');
    const nonMemberRows = txRows.filter(r => r.activity_type === 'non_member_sale');
    const onlineRows = txRows.filter(r => r.activity_type === 'online_order');
    const rxRows = txRows.filter(r => r.activity_type === 'prescription_dispensing');

    const buildPaymentBreakdown = (rows) => {
      const paymentMethods = {};
      for (const r of paidRows(rows)) {
        const pm = (r.payment_method || 'cash').toLowerCase();
        if (!paymentMethods[pm]) paymentMethods[pm] = { count: 0, value: 0 };
        paymentMethods[pm].count++;
        paymentMethods[pm].value = parseFloat((paymentMethods[pm].value + Number(r.grand_total || 0)).toFixed(2));
      }
      return paymentMethods;
    };

    const build = (rows) => ({
      transactions: rows.length,
      paid_count: paidRows(rows).length,
      pending_count: pendingRows(rows).length,
      qty: sum(rows, 'total_qty'),
      value: parseFloat(sum(paidRows(rows), 'grand_total').toFixed(2)),
      pending_value: parseFloat(sum(pendingRows(rows), 'grand_total').toFixed(2)),
      status: rows.length === 0 ? 'no_activity'
        : pendingRows(rows).length > 0 && paidRows(rows).length === 0 ? 'unpaid'
        : pendingRows(rows).length > 0 ? 'partial'
        : 'paid',
      payment_methods: buildPaymentBreakdown(rows),
    });

    const buildRxWithDetail = (rows) => {
      const base = build(rows);
      // Per-transaction line items with nested per-product detail
      const line_items = rows.map(r => {
        const products = rxProductMap[r.form_reference_id] || [];
        return {
          reference_id: r.form_reference_id,
          client_name: r.client_name,
          client_type: r.client_type,
          date: r.service_date,
          total_qty: Number(r.total_qty || 0),
          total_dp_value: parseFloat(Number(r.product_total_dp || r.grand_total || 0).toFixed(2)),
          payment_method: r.payment_method || 'cash',
          payment_status: r.payment_status,
          products,
        };
      });
      return { ...base, line_items };
    };

    const consultObj = {
      ...build(consultRows),
      fee_value: parseFloat(sum(paidRows(consultRows), 'consultation_fee').toFixed(2)),
      pending_fee_value: parseFloat(sum(pendingRows(consultRows), 'consultation_fee').toFixed(2)),
    };

    const grandTotal = parseFloat((
      sum(paidRows(consultRows), 'grand_total') +
      sum(paidRows(walkinRows), 'grand_total') +
      sum(paidRows(memberRows), 'grand_total') +
      sum(paidRows(nonMemberRows), 'grand_total') +
      sum(paidRows(onlineRows), 'grand_total') +
      sum(paidRows(rxRows), 'grand_total')
    ).toFixed(2));

    const totalPendingValue = parseFloat((
      sum(pendingRows(consultRows), 'grand_total') +
      sum(pendingRows(walkinRows), 'grand_total') +
      sum(pendingRows(memberRows), 'grand_total') +
      sum(pendingRows(nonMemberRows), 'grand_total') +
      sum(pendingRows(onlineRows), 'grand_total') +
      sum(pendingRows(rxRows), 'grand_total')
    ).toFixed(2));

    const pendingCapture = txRows.filter(r => r.reporting_status === 'pending').length;

    const nmCpTotal = parseFloat(sum(paidRows(nonMemberRows), 'grand_total').toFixed(2));
    const nmDpTotal = parseFloat(sum(paidRows(nonMemberRows), 'product_total_dp').toFixed(2));
    const distributorProfit = parseFloat(Math.max(0, nmCpTotal - nmDpTotal).toFixed(2));
    const walkInRxSales = parseFloat((
      sum(paidRows(walkinRows), 'grand_total') +
      sum(paidRows(memberRows), 'grand_total') +
      nmCpTotal +
      sum(paidRows(rxRows), 'grand_total')
    ).toFixed(2));
    const consultFeeTotal = consultObj.fee_value || 0;
    const branchSales = parseFloat((walkInRxSales - distributorProfit - consultFeeTotal).toFixed(2));
    const branchSummary = { walkin_rx_sales: walkInRxSales, distributor_profit: distributorProfit, consultation_fees: consultFeeTotal, branch_sales: branchSales };

    // Try to attach pre-computed stock snapshot for this date/branch
    let stockSnapshot = null;
    try {
      const snapshotId = branchId && branchId !== 'all'
        ? `daily-${date}-${(branchId).replace(/[^a-zA-Z0-9_]/g, '_')}`
        : `daily-${date}-all`;
      const snapshotRow = await getOne(
        `SELECT report_data, computed_at FROM stock_report_summaries WHERE id = $1`,
        [snapshotId]
      ).catch(() => null);
      if (snapshotRow) {
        stockSnapshot = {
          source: 'precomputed',
          computed_at: snapshotRow.computed_at,
          data: typeof snapshotRow.report_data === 'string' ? JSON.parse(snapshotRow.report_data) : snapshotRow.report_data,
        };
      }
    } catch {}

    res.status(200).json({
      success: true,
      branch_id: branchId || 'all',
      date,
      stock_snapshot: stockSnapshot,
      client_visits: visitRows.length,
      client_visit_types: visitRows.reduce((acc, v) => { acc[v.visit_type] = (acc[v.visit_type] || 0) + 1; return acc; }, {}),
      consultations: consultObj,
      walkin_sales: build(walkinRows),
      member_sales: build(memberRows),
      non_member_sales: build(nonMemberRows),
      online_order_sales: build(onlineRows),
      prescription_dispensing: buildRxWithDetail(rxRows),
      pending_unposted_records: pendingCapture,
      grand_total: grandTotal,
      total_pending_value: totalPendingValue,
      total_transactions: txRows.length,
      total_qty_sold: sum(txRows, 'total_qty'),
      branch_summary: branchSummary,
    });
  } catch (err) {
    console.error('daily branch sales report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
