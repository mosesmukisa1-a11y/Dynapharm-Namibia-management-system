import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';
import { ALL_BRANCH_LOCATION_ALIASES } from '../../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const search = url.searchParams.get('search') || '';

    const [batches, branchInv] = await Promise.all([
      // Warehouse stock. Prices come from product_prices (GM Price List) first.
      getMany(`
        SELECT sb.description,
               sb.remaining_quantity,
               sb.quantity,
               COALESCE(NULLIF(p.cif, 0), NULLIF(sb.cif_unit_cost,  0), NULLIF(sb.unit_price, 0), 0) AS cif_unit_cost,
               COALESCE(NULLIF(p.dp,  0), NULLIF(sb.dpc_unit_value, 0), NULLIF(sb.unit_price, 0), 0) AS dpc_unit_value
        FROM   stock_batches sb
        LEFT JOIN product_prices p
               ON LOWER(TRIM(p.description)) = LOWER(TRIM(sb.description))
        WHERE  sb.remaining_quantity > 0
          AND  COALESCE(sb.status, '') != 'expired'
          AND  sb.location != ALL($1::text[])
      `, [ALL_BRANCH_LOCATION_ALIASES]),
      // Branch stock. Prices from product_prices (GM Price List).
      getMany(`
        SELECT b.product_name,
               SUM(b.quantity)          AS closing_qty,
               MAX(COALESCE(p.dp,  0)) AS unit_dp,
               MAX(COALESCE(p.cif, 0)) AS unit_cif
        FROM   branch_inventory_batches b
        LEFT JOIN product_prices p
               ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
        WHERE  b.quantity > 0
        GROUP BY b.product_name
      `),
    ]);

    const productMap = {};

    batches.forEach(b => {
      const name = b.description || 'Unknown';
      const qty  = Number(b.remaining_quantity || b.quantity || 0);
      if (!productMap[name]) productMap[name] = { productName: name, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      productMap[name].totalQty      += qty;
      productMap[name].totalValueCIF += qty * Number(b.cif_unit_cost  || 0);
      productMap[name].totalValueDPC += qty * Number(b.dpc_unit_value || 0);
    });

    branchInv.forEach(b => {
      const name = b.product_name || 'Unknown';
      const qty  = Number(b.closing_qty || 0);
      if (!productMap[name]) productMap[name] = { productName: name, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      productMap[name].totalQty      += qty;
      productMap[name].totalValueCIF += qty * Number(b.unit_cif || 0);
      productMap[name].totalValueDPC += qty * Number(b.unit_dp  || 0);
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
