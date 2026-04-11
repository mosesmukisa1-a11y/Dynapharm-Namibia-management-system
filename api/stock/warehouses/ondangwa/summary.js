import { applyAuthCors } from '../../../_lib/auth.js';
import { getWarehouseBatches, getWarehouseTransfers, buildWarehouseSummary } from '../_warehouseHelper.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const [batches, inbound, outbound] = await Promise.all([
      getWarehouseBatches('ondangwa_warehouse'),
      getWarehouseTransfers('ondangwa_warehouse', 'incoming'),
      getWarehouseTransfers('ondangwa_warehouse', 'outbound'),
    ]);
    const summary = buildWarehouseSummary('Ondangwa', batches, inbound, outbound);
    res.status(200).json({ success: true, warehouse: summary });
  } catch (err) {
    console.error('Ondangwa summary error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
