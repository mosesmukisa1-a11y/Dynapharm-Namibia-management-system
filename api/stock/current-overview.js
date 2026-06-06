/**
 * GET /api/stock/current-overview
 * Countrywide stock snapshot — GM Portal "Current Stock" tab.
 *
 * Sources:
 *   • inventory_balances  location_type IN ('branch','warehouse')
 *     – uses stock_value_dp / stock_value_cif; falls back to
 *       closing_qty × unit price from product_prices where stored
 *       value is zero (same prices visible in GM Price List).
 *   • field_stock         active field officer balances, priced via
 *       product_prices; origin_location shown as source branch.
 *
 * Excluded intentionally:
 *   • country_stock  — transit / distribution staging only
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
    const [invRows, fieldRows, priceRows] = await Promise.all([
      // Branches + warehouses — authoritative held stock
      getMany(
        `SELECT location_type, location_id, product_name,
                SUM(closing_qty)                                          AS qty,
                SUM(stock_value_dp)                                       AS val_dp,
                SUM(COALESCE(stock_value_cif, closing_qty * unit_cif, 0)) AS val_cif,
                MAX(unit_dp)                                              AS unit_dp,
                MAX(unit_cif)                                             AS unit_cif
         FROM inventory_balances
         WHERE location_type IN ('branch', 'warehouse')
           AND closing_qty > 0
         GROUP BY location_type, location_id, product_name`
      ),
      // Field officer balances — grouped by product + source branch
      getMany(
        `SELECT product_name,
                officer_name,
                COALESCE(origin_location, team_name, 'Field') AS source_branch,
                SUM(balance) AS qty
         FROM field_stock
         WHERE balance > 0
         GROUP BY product_name, officer_name, origin_location, team_name`
      ),
      // GM price list — DP and CIF for every product
      getMany(`SELECT description, cif, dp FROM product_prices`),
    ]);

    // Price lookup keyed by lowercase product name
    const priceMap = {};
    for (const p of priceRows) {
      priceMap[(p.description || '').toLowerCase().trim()] = {
        cif: Number(p.cif || 0),
        dp:  Number(p.dp  || 0),
      };
    }
    const lookupCif = n => priceMap[(n || '').toLowerCase().trim()]?.cif || 0;
    const lookupDp  = n => priceMap[(n || '').toLowerCase().trim()]?.dp  || 0;

    const products = new Map();

    function upsert(productName, locationType, locationName, qty, cif, dp) {
      const key = (productName || '').toLowerCase().trim();
      if (!key || qty <= 0) return;
      if (!products.has(key)) {
        products.set(key, { productName, totalQty: 0, totalValueCIF: 0, totalValueDP: 0, locations: [] });
      }
      const p = products.get(key);
      p.productName   = productName;
      p.totalQty      += qty;
      p.totalValueCIF += cif;
      p.totalValueDP  += dp;
      p.locations.push({
        locationType,
        locationName,
        qty,
        valueCIF: parseFloat(cif.toFixed(2)),
        valueDP:  parseFloat(dp.toFixed(2)),
      });
    }

    // ── Inventory balances (branches + warehouses) ──
    // Use stored stock_value_dp; fall back to unit prices from product_prices
    // for rows where the stored value is zero (e.g. items imported without
    // a DP price recorded at the time).
    for (const r of invRows) {
      const qty    = Number(r.qty     || 0);
      const unitDP  = Number(r.unit_dp  || 0) || lookupDp(r.product_name);
      const unitCIF = Number(r.unit_cif || 0) || lookupCif(r.product_name);
      const valDP  = Number(r.val_dp  || 0) || qty * unitDP;
      const valCIF = Number(r.val_cif || 0) || qty * unitCIF;
      const type   = r.location_type === 'warehouse' ? 'warehouse' : 'branch';
      upsert(r.product_name, type, locLabel(r.location_id), qty, valCIF, valDP);
    }

    // ── Field stock — priced via GM price list ──
    // Location label shows officer name + source branch for full traceability.
    for (const r of fieldRows) {
      const qty    = Number(r.qty || 0);
      const dp     = qty * lookupDp(r.product_name);
      const cif    = qty * lookupCif(r.product_name);
      const srcLabel = locLabel(r.source_branch);
      const label    = r.officer_name
        ? `${r.officer_name} (from ${srcLabel})`
        : `Field — ${srcLabel}`;
      upsert(r.product_name, 'field', label, qty, cif, dp);
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
