/**
 * GET /api/stock/current-overview
 * Countrywide stock snapshot — GM Portal "Current Stock" tab.
 *
 * Source: inventory_balances WHERE location_type IN ('branch','warehouse')
 *
 * Uses stock_value_dp / stock_value_cif directly (same logic as the
 * Accounts Financial Position endpoint) — no price-table fallback that
 * would inflate figures for rows where unit prices are missing.
 *
 * Excluded intentionally:
 *   • country_stock  — transit / distribution staging only
 *   • field_stock    — not a held company inventory location
 *   • stock_batches  — would double-count warehouse rows already in
 *                      inventory_balances
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const ALLOWED = new Set(['admin', 'gm', 'director', 'mis', 'stock', 'finance']);

function locLabel(id) {
  return (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!ALLOWED.has(req.user.role)) return res.status(403).json({ success: false, error: 'Access denied' });

  try {
    const rows = await getMany(
      `SELECT location_type, location_id, product_name,
              SUM(closing_qty)                                          AS qty,
              SUM(stock_value_dp)                                       AS val_dp,
              SUM(COALESCE(stock_value_cif, closing_qty * unit_cif, 0)) AS val_cif
       FROM inventory_balances
       WHERE location_type IN ('branch', 'warehouse')
         AND closing_qty > 0
       GROUP BY location_type, location_id, product_name`
    );

    const products = new Map();

    for (const r of rows) {
      const qty    = Number(r.qty     || 0);
      const valDP  = Number(r.val_dp  || 0);   // no fallback — match Accounts
      const valCIF = Number(r.val_cif || 0);
      if (qty <= 0) continue;

      const key  = (r.product_name || '').toLowerCase().trim();
      if (!key) continue;

      const type = r.location_type === 'warehouse' ? 'warehouse' : 'branch';
      const name = locLabel(r.location_id);

      if (!products.has(key)) {
        products.set(key, {
          productName:   r.product_name,
          totalQty:      0,
          totalValueCIF: 0,
          totalValueDP:  0,
          locations:     [],
        });
      }
      const p = products.get(key);
      p.productName   = r.product_name;
      p.totalQty      += qty;
      p.totalValueCIF += valCIF;
      p.totalValueDP  += valDP;
      p.locations.push({
        locationType: type,
        locationName: name,
        qty,
        valueCIF: parseFloat(valCIF.toFixed(2)),
        valueDP:  parseFloat(valDP.toFixed(2)),
      });
    }

    const productList = Array.from(products.values())
      .map(p => ({
        ...p,
        totalQty:      parseFloat(p.totalQty.toFixed(2)),
        totalValueCIF: parseFloat(p.totalValueCIF.toFixed(2)),
        totalValueDP:  parseFloat(p.totalValueDP.toFixed(2)),
        locations: p.locations.sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalValueDP - a.totalValueDP);

    const summary = {
      productCount:  productList.length,
      totalQtyUnits: parseFloat(productList.reduce((s, p) => s + p.totalQty,      0).toFixed(2)),
      totalValueCIF: parseFloat(productList.reduce((s, p) => s + p.totalValueCIF, 0).toFixed(2)),
      totalValueDP:  parseFloat(productList.reduce((s, p) => s + p.totalValueDP,  0).toFixed(2)),
    };

    res.json({ success: true, summary, products: productList });
  } catch (err) {
    console.error('[stock/current-overview]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
