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

    const sales = await getMany(`SELECT items FROM branch_walkin_sales ${dateWhere}`.trim(), params);

    const productMap = {};
    sales.forEach(s => {
      try {
        const items = typeof s.items === 'string' ? JSON.parse(s.items || '[]') : (s.items || []);
        items.forEach(i => {
          const name = i.product_name || i.name || 'Unknown';
          if (!productMap[name]) productMap[name] = { totalQty: 0, totalRevenue: 0 };
          productMap[name].totalQty += Number(i.quantity || i.qty || 1);
          productMap[name].totalRevenue += Number(i.line_total || 0) || Number(i.unit_price || 0) * Number(i.quantity || i.qty || 1);
        });
      } catch {}
    });

    const products = Object.entries(productMap)
      .map(([name, d]) => ({
        productName: name,
        totalQty: d.totalQty,
        totalRevenue: parseFloat(d.totalRevenue.toFixed(2)),
      }))
      .sort((a, b) => b.totalQty - a.totalQty);

    res.status(200).json({ success: true, products, period: month || 'all' });
  } catch (err) {
    console.error('Monthly sales products error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
