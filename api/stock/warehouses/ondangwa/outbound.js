import { applyAuthCors } from '../../../_lib/auth.js';
import { getWarehouseTransfers } from '../_warehouseHelper.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const transfers = await getWarehouseTransfers('ondangwa', 'outbound');
    res.status(200).json({ success: true, transfers, total: transfers.length });
  } catch (err) {
    console.error('Ondangwa outbound error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
