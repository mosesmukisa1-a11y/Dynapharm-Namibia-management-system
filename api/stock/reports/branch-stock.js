import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchId = url.searchParams.get('branchId') || '';

    const conditions = [`location_type = 'branch'`];
    const params = [];
    if (branchId && branchId !== 'all') { conditions.push(`location_id = $${params.length + 1}`); params.push(branchId); }

    const branchInv = await getMany(
      `SELECT location_id, product_name, batch_no, opening_qty, inward_qty, outward_qty, closing_qty, unit_dp, stock_value_dp, expiry_date, updated_at FROM inventory_balances WHERE ${conditions.join(' AND ')} ORDER BY location_id, product_name`,
      params
    );

    const grouped = {};
    branchInv.forEach(b => {
      const bid = b.location_id;
      if (!grouped[bid]) grouped[bid] = { branchId: bid, branchName: bid.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), items: [], totalQty: 0, totalValueDPC: 0 };
      const qty = Number(b.closing_qty || 0);
      const val = Number(b.stock_value_dp || 0) || qty * Number(b.unit_dp || 0);
      grouped[bid].items.push({
        productName: b.product_name,
        batchNo: b.batch_no,
        openingQty: Number(b.opening_qty || 0),
        inwardQty: Number(b.inward_qty || 0),
        outwardQty: Number(b.outward_qty || 0),
        closingQty: qty,
        unitDPC: Number(b.unit_dp || 0),
        stockValueDPC: parseFloat(val.toFixed(2)),
        expiryDate: b.expiry_date,
      });
      grouped[bid].totalQty += qty;
      grouped[bid].totalValueDPC += val;
    });

    const branches = Object.values(grouped).map(b => ({ ...b, totalValueDPC: parseFloat(b.totalValueDPC.toFixed(2)) }));
    res.status(200).json({ success: true, branches, total: branchInv.length });
  } catch (err) {
    console.error('Branch stock report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
