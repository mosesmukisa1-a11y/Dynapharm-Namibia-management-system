import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [batches, branchInv] = await Promise.all([
      getMany("SELECT location, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price FROM stock_batches WHERE location != 'country_stock' AND remaining_quantity > 0 AND COALESCE(status,'') != 'expired'"),
      // Branch stock: authoritative source, not the stale inventory_balances cache.
      getMany(`SELECT b.branch_id AS location_id,
                      SUM(b.quantity)             AS closing_qty,
                      MAX(COALESCE(p.dp,  0))     AS unit_dp,
                      MAX(COALESCE(p.cif, 0))     AS unit_cif
               FROM branch_inventory_batches b
               LEFT JOIN product_prices p
                     ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
               WHERE b.quantity > 0
               GROUP BY b.branch_id`),
    ]);

    const locationMap = {};

    batches.forEach(b => {
      const loc = (b.location || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const qty = Number(b.remaining_quantity || b.quantity || 0);
      if (!locationMap[loc]) locationMap[loc] = { locationName: loc, locationType: 'warehouse', totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      locationMap[loc].totalQty += qty;
      locationMap[loc].totalValueCIF += qty * Number(b.cif_unit_cost || b.unit_price || 0);
      locationMap[loc].totalValueDPC += qty * Number(b.dpc_unit_value || b.unit_price || 0);
    });

    branchInv.forEach(b => {
      const loc = (b.location_id || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const qty = Number(b.closing_qty || 0);
      if (!locationMap[loc]) locationMap[loc] = { locationName: loc, locationType: 'branch', totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      locationMap[loc].totalQty += qty;
      locationMap[loc].totalValueCIF += qty * Number(b.unit_cif || 0);
      locationMap[loc].totalValueDPC += qty * Number(b.unit_dp || 0);
    });

    const locations = Object.values(locationMap).map(l => ({
      ...l,
      totalValueCIF: parseFloat(l.totalValueCIF.toFixed(2)),
      totalValueDPC: parseFloat(l.totalValueDPC.toFixed(2)),
    })).sort((a, b) => b.totalValueDPC - a.totalValueDPC);

    res.status(200).json({ success: true, locations });
  } catch (err) {
    console.error('Valuation locations error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
