import { applyAuthCors } from '../../../_lib/auth.js';
import { getWarehouseWriteoffReturns } from '../_warehouseHelper.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const returns = await getWarehouseWriteoffReturns('windhoek_warehouse');
    res.status(200).json({ success: true, returns, total: returns.length });
  } catch (err) {
    console.error('Windhoek returns error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
