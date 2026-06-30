import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const month = url.searchParams.get('month') || null;
    const branchId = url.searchParams.get('branchId') || 'all';

    let dateFilter = '';
    const params = [];
    if (month) {
      const [yr, mo] = month.split('-');
      const start = `${yr}-${mo}-01`;
      const end = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      dateFilter = `WHERE created_at >= $1 AND created_at <= $2`;
      params.push(start, end + 'T23:59:59');
    }

    const [walkinSales, movements] = await Promise.all([
      getMany(`SELECT branch_id, customer_type, total, items, created_at FROM branch_walkin_sales ${dateFilter} ORDER BY created_at DESC`.trim(), params),
      getMany(`SELECT product_name, movement_type, quantity, source_location, created_at FROM stock_movements WHERE movement_type IN ('dispense','prescription_dispense') ${month ? 'AND created_at >= $1 AND created_at <= $2' : ''} ORDER BY created_at DESC`.trim(), month ? params : []),
    ]);

    const canonicalFilter = branchId !== 'all' ? (normalizeBranchSlug(branchId) || branchId) : null;
    const filtered = canonicalFilter
      ? walkinSales.filter(s => (normalizeBranchSlug(s.branch_id) || s.branch_id) === canonicalFilter)
      : walkinSales;

    const memberSales = filtered.filter(s => ['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(s.customer_type));
    const nonMemberSales = filtered.filter(s => !['member', 'walk_in_member_sale', 'walkin_member_sale'].includes(s.customer_type));

    const sumTotal = (arr) => arr.reduce((s, r) => s + Number(r.total || 0), 0);

    const prescriptionUnits = movements.reduce((s, m) => s + Number(m.quantity || 0), 0);
    const walkinTotal = sumTotal(filtered);
    const memberTotal = sumTotal(memberSales);
    const nonMemberTotal = sumTotal(nonMemberSales);

    res.status(200).json({
      success: true,
      summary: {
        walkinSales: parseFloat(walkinTotal.toFixed(2)),
        memberSales: parseFloat(memberTotal.toFixed(2)),
        nonMemberSales: parseFloat(nonMemberTotal.toFixed(2)),
        prescriptionSales: prescriptionUnits,
        totalSales: parseFloat(walkinTotal.toFixed(2)),
        transactionCount: filtered.length,
      },
      period: month || 'all',
      branchId,
    });
  } catch (err) {
    console.error('Monthly sales error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
