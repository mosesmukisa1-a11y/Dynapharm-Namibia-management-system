import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { normalizeBranchName } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const asOfDate = req.query.asOfDate || new Date().toISOString().slice(0, 10);

    const rows = await getMany(
      `SELECT location_type, location_id, product_name, batch_no, expiry_date,
              closing_qty, stock_value_dp, unit_dp
       FROM inventory_balances
       WHERE location_type IN ('warehouse', 'branch')
         AND closing_qty > 0
       ORDER BY location_type, location_id, product_name`
    );

    const warehouseMap = new Map();
    const branchMap = new Map();
    let totalCompanyValueDP = 0;

    for (const r of rows) {
      const val = Number(r.stock_value_dp || 0);
      totalCompanyValueDP += val;

      const entry = {
        productName: r.product_name,
        batchNo: r.batch_no,
        expiryDate: r.expiry_date,
        closingQty: Number(r.closing_qty || 0),
        unitDP: Number(r.unit_dp || 0),
        stockValueDP: val,
      };

      if (r.location_type === 'warehouse') {
        if (!warehouseMap.has(r.location_id)) {
          warehouseMap.set(r.location_id, {
            warehouseId: r.location_id,
            warehouseName: normalizeBranchName(r.location_id),
            totalValueDP: 0,
            items: [],
          });
        }
        const w = warehouseMap.get(r.location_id);
        w.totalValueDP += val;
        w.items.push(entry);
      } else {
        if (!branchMap.has(r.location_id)) {
          branchMap.set(r.location_id, {
            branchId: r.location_id,
            branchName: normalizeBranchName(r.location_id),
            totalValueDP: 0,
            items: [],
          });
        }
        const b = branchMap.get(r.location_id);
        b.totalValueDP += val;
        b.items.push(entry);
      }
    }

    const warehouseValueDP = Array.from(warehouseMap.values()).reduce((s, w) => s + w.totalValueDP, 0);
    const branchValueDP    = Array.from(branchMap.values()).reduce((s, b) => s + b.totalValueDP, 0);

    res.json({
      success: true,
      asOfDate,
      warehouses: Array.from(warehouseMap.values()),
      branches: Array.from(branchMap.values()),
      totalCompanyValueDP,
      companyValueDP: totalCompanyValueDP,
      warehouseValueDP,
      branchValueDP,
    });
  } catch (err) {
    console.error('[finance/reports/stock-value]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
