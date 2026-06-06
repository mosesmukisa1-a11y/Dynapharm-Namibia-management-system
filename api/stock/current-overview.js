/**
 * GET /api/stock/current-overview
 * Countrywide stock snapshot — GM Portal "Current Stock" tab.
 *
 * Sources (authoritative only):
 *   • inventory_balances  location_type IN ('branch','warehouse')
 *   • field_stock         active field officer balances
 *   • product_prices      CIF fallback where unit_cif is absent
 *
 * Country stock (stock_batches location='country_stock') is intentionally
 * EXCLUDED — it is a transit / distribution staging area, not a held
 * stock location.  Warehouse batches in stock_batches are also excluded
 * to avoid double-counting with inventory_balances, which is the single
 * source of truth for received stock.
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
      // Branches + warehouses — single source of truth
      getMany(
        `SELECT location_type, location_id, product_name,
                SUM(closing_qty)                                       AS qty,
                SUM(stock_value_dp)                                    AS val_dp,
                SUM(COALESCE(stock_value_cif, closing_qty * unit_cif, 0)) AS val_cif,
                MAX(unit_dp)                                            AS unit_dp,
                MAX(unit_cif)                                           AS unit_cif
         FROM inventory_balances
         WHERE location_type IN ('branch', 'warehouse')
           AND closing_qty > 0
         GROUP BY location_type, location_id, product_name`
      ),
      // Field officer balances
      getMany(
        `SELECT team_name, officer_name, product_name,
                SUM(balance) AS qty
         FROM field_stock
         WHERE balance > 0
         GROUP BY team_name, officer_name, product_name`
      ),
      // Price lookup for CIF fallback
      getMany(`SELECT description, cif, dp FROM product_prices`),
    ]);

    // CIF / DP price lookup keyed by lowercase product name
    const priceMap = {};
    for (const p of priceRows) {
      priceMap[(p.description || '').toLowerCase().trim()] = {
        cif: Number(p.cif || 0),
        dp:  Number(p.dp  || 0),
      };
    }
    const lookupCif = name => priceMap[(name || '').toLowerCase().trim()]?.cif || 0;
    const lookupDp  = name => priceMap[(name || '').toLowerCase().trim()]?.dp  || 0;

    // Accumulate: productKey → { productName, totals, locations[] }
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
    for (const r of invRows) {
      const qty    = Number(r.qty     || 0);
      const valDP  = Number(r.val_dp  || 0) || qty * Number(r.unit_dp  || lookupDp(r.product_name));
      const valCIF = Number(r.val_cif || 0) || qty * Number(r.unit_cif || lookupCif(r.product_name));
      const type   = r.location_type === 'warehouse' ? 'warehouse' : 'branch';
      upsert(r.product_name, type, locLabel(r.location_id), qty, valCIF, valDP);
    }

    // ── Field stock ──
    for (const r of fieldRows) {
      const qty  = Number(r.qty || 0);
      const name = r.officer_name || r.team_name || 'Field Officer';
      upsert(r.product_name, 'field', `Field — ${name}`,
        qty,
        qty * lookupCif(r.product_name),
        qty * lookupDp(r.product_name),
      );
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
