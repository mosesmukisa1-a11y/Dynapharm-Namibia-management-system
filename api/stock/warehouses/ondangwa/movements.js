import { applyAuthCors } from '../../../_lib/auth.js';
import { getWarehouseMovements } from '../_warehouseHelper.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const movements = await getWarehouseMovements('ondangwa');
    res.status(200).json({ success: true, movements, total: movements.length });
  } catch (err) {
    console.error('Ondangwa movements error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
