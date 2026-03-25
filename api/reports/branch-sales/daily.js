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

    const [txRows, visitRows] = await Promise.all([
      getMany(
        `SELECT * FROM branch_activity_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at ASC`,
        params
      ),
      getMany(
        `SELECT * FROM branch_client_visits WHERE checkin_time::date = $1${branchId && branchId !== 'all' ? ' AND branch_id = $2' : ''} ORDER BY checkin_time ASC`,
        branchId && branchId !== 'all' ? [date, branchId] : [date]
      ),
    ]);

    const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);
    const paidRows = (rows) => rows.filter(r => r.payment_status === 'paid');
    const pendingRows = (rows) => rows.filter(r => r.payment_status !== 'paid');

    const consultRows = txRows.filter(r => ['consultation', 'full_body_checkup'].includes(r.activity_type));
    const walkinRows = txRows.filter(r => r.activity_type === 'walkin_sale');
    const memberRows = txRows.filter(r => r.activity_type === 'member_sale');
    const nonMemberRows = txRows.filter(r => r.activity_type === 'non_member_sale');
    const onlineRows = txRows.filter(r => r.activity_type === 'online_order');
    const rxRows = txRows.filter(r => r.activity_type === 'prescription_dispensing');

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
    });

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

    res.status(200).json({
      success: true,
      branch_id: branchId || 'all',
      date,
      client_visits: visitRows.length,
      client_visit_types: visitRows.reduce((acc, v) => { acc[v.visit_type] = (acc[v.visit_type] || 0) + 1; return acc; }, {}),
      consultations: consultObj,
      walkin_sales: build(walkinRows),
      member_sales: build(memberRows),
      non_member_sales: build(nonMemberRows),
      online_order_sales: build(onlineRows),
      prescription_dispensing: build(rxRows),
      pending_unposted_records: pendingCapture,
      grand_total: grandTotal,
      total_pending_value: totalPendingValue,
      total_transactions: txRows.length,
      total_qty_sold: sum(txRows, 'total_qty'),
    });
  } catch (err) {
    console.error('daily branch sales report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
