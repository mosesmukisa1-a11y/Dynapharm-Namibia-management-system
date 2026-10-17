import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const warehouseId = url.searchParams.get('from_warehouse');
    const productsParam = url.searchParams.get('products') || '';
    const productNames = productsParam.split(',').map((p) => p.trim()).filter(Boolean);

    if (!warehouseId) {
      return res.status(400).json({ success: false, error: 'from_warehouse is required' });
    }

    let rows;
    if (productNames.length > 0) {
      rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/transfers/batch-availability.js:22:0"),









      [warehouseId, productNames.map((p) => p.toLowerCase().trim())]);

    } else {
      rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/transfers/batch-availability.js:35:1"),








      [warehouseId]);

    }

    const byProduct = {};
    rows.forEach((r) => {
      const key = (r.product_name || '').toLowerCase().trim();
      if (!byProduct[key]) {
        byProduct[key] = { productName: r.product_name, totalAvailable: 0, batches: [] };
      }
      const qty = Number(r.available_qty || 0);
      const expiryRaw = r.expiry_date;
      const expiryDate = expiryRaw instanceof Date ?
      expiryRaw.toISOString().split('T')[0] :
      expiryRaw || null;
      byProduct[key].batches.push({ batchNo: r.batch_no || null, expiryDate, availableQty: qty });
      byProduct[key].totalAvailable += qty;
    });

    res.json({ success: true, availability: Object.values(byProduct) });
  } catch (err) {
    console.error('[transfers/batch-availability]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
