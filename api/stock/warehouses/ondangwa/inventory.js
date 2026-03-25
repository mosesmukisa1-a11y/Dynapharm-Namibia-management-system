import { applyAuthCors } from '../../../_lib/auth.js';
import { getWarehouseBatches, getWarehouseTransfers, buildWarehouseSummary, formatBatchItems } from '../_warehouseHelper.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const search = url.searchParams.get('search') || '';
    const batchNo = url.searchParams.get('batchNo') || '';

    const [batches, inbound, outbound] = await Promise.all([
      getWarehouseBatches('ondangwa'),
      getWarehouseTransfers('ondangwa', 'incoming'),
      getWarehouseTransfers('ondangwa', 'outbound'),
    ]);

    let items = formatBatchItems(batches);
    if (search) items = items.filter(i => i.productName.toLowerCase().includes(search.toLowerCase()));
    if (batchNo) items = items.filter(i => (i.batchNo || '').toLowerCase().includes(batchNo.toLowerCase()));

    const warehouse = buildWarehouseSummary('Ondangwa', batches, inbound, outbound);
    res.status(200).json({ success: true, warehouse, items });
  } catch (err) {
    console.error('Ondangwa inventory error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
