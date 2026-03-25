import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const month = url.searchParams.get('month') || null;

    let params = [];
    let dateWhere = '';
    if (month) {
      const [yr, mo] = month.split('-');
      const start = `${yr}-${mo}-01`;
      const end = new Date(Number(yr), Number(mo), 0).toISOString().slice(0, 10);
      dateWhere = 'WHERE created_at >= $1 AND created_at <= $2';
      params = [start, end + 'T23:59:59'];
    }

    const sales = await getMany(
      `SELECT branch_id, SUM(total) as total_revenue, COUNT(*) as transaction_count FROM branch_walkin_sales ${dateWhere} GROUP BY branch_id ORDER BY total_revenue DESC`.trim(),
      params
    );

    const branches = sales.map(s => ({
      branchId: s.branch_id,
      branchName: (s.branch_id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      totalRevenue: parseFloat(Number(s.total_revenue || 0).toFixed(2)),
      transactionCount: Number(s.transaction_count || 0),
    }));

    res.status(200).json({ success: true, branches, period: month || 'all' });
  } catch (err) {
    console.error('Monthly sales branches error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
