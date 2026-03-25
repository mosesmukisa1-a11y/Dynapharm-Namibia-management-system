import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const search = url.searchParams.get('search') || '';

    const [batches, branchInv] = await Promise.all([
      getMany('SELECT description, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price FROM stock_batches'),
      getMany("SELECT product_name, closing_qty, unit_dp FROM inventory_balances WHERE location_type = 'branch'"),
    ]);

    const productMap = {};

    batches.forEach(b => {
      const name = b.description || 'Unknown';
      const qty = Number(b.remaining_quantity || b.quantity || 0);
      if (!productMap[name]) productMap[name] = { productName: name, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      productMap[name].totalQty += qty;
      productMap[name].totalValueCIF += qty * Number(b.cif_unit_cost || b.unit_price || 0);
      productMap[name].totalValueDPC += qty * Number(b.dpc_unit_value || b.unit_price || 0);
    });

    branchInv.forEach(b => {
      const name = b.product_name || 'Unknown';
      const qty = Number(b.closing_qty || 0);
      if (!productMap[name]) productMap[name] = { productName: name, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      productMap[name].totalQty += qty;
      productMap[name].totalValueDPC += qty * Number(b.unit_dp || 0);
    });

    let products = Object.values(productMap).map(p => ({
      ...p,
      totalValueCIF: parseFloat(p.totalValueCIF.toFixed(2)),
      totalValueDPC: parseFloat(p.totalValueDPC.toFixed(2)),
    })).sort((a, b) => b.totalValueDPC - a.totalValueDPC);

    if (search) products = products.filter(p => p.productName.toLowerCase().includes(search.toLowerCase()));

    res.status(200).json({ success: true, products });
  } catch (err) {
    console.error('Valuation products error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
