/**
 * GET /api/stock/current-overview
 * Returns countrywide stock snapshot for GM Portal "Current Stock" tab.
 *
 * Sources:
 *   • inventory_balances (location_type IN branch, warehouse)
 *   • stock_batches      (country_stock + warehouse batches)
 *   • field_stock        (field officer balances)
 *   • product_prices     (for CIF lookups where missing)
 *
 * Response shape:
 *   {
 *     summary: { totalQtyUnits, totalValueCIF, totalValueDP, productCount },
 *     products: [
 *       {
 *         productName, totalQty, totalValueCIF, totalValueDP,
 *         locations: [{ locationType, locationName, qty, valueCIF, valueDP }]
 *       }
 *     ]
 *   }
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

const ALLOWED = new Set(['admin', 'gm', 'director', 'mis', 'stock', 'finance']);

function locLabel(type, id) {
  if (!id) return type;
  return (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!ALLOWED.has(req.user.role)) return res.status(403).json({ success: false, error: 'Access denied' });

  try {
    const [invRows, batchRows, fieldRows, priceRows] = await Promise.all([
      // Branches + warehouses from inventory_balances
      getMany(
        `SELECT location_type, location_id, product_name,
                SUM(closing_qty)       AS qty,
                SUM(stock_value_dp)    AS val_dp,
                SUM(COALESCE(stock_value_cif, closing_qty * unit_cif, 0)) AS val_cif,
                MAX(unit_dp)           AS unit_dp,
                MAX(unit_cif)          AS unit_cif
         FROM inventory_balances
         WHERE location_type IN ('branch','warehouse')
           AND closing_qty > 0
         GROUP BY location_type, location_id, product_name`
      ),
      // Country stock + warehouse batches from stock_batches
      getMany(
        `SELECT location, description AS product_name,
                SUM(remaining_quantity)                             AS qty,
                SUM(remaining_quantity * cif_unit_cost)            AS val_cif,
                SUM(remaining_quantity * COALESCE(dpc_unit_value, cif_unit_cost, 0)) AS val_dp,
                MAX(cif_unit_cost)                                  AS unit_cif,
                MAX(dpc_unit_value)                                  AS unit_dp
         FROM stock_batches
         WHERE remaining_quantity > 0
           AND location NOT IN ('branch')
         GROUP BY location, description`
      ),
      // Field stock (active balances)
      getMany(
        `SELECT team_name, officer_name, product_name,
                SUM(balance) AS qty
         FROM field_stock
         WHERE balance > 0
         GROUP BY team_name, officer_name, product_name`
      ),
      // Product prices for CIF fallback
      getMany(`SELECT description, cif, dp FROM product_prices`),
    ]);

    // Build CIF/DP lookup by product name (lowercase key)
    const priceMap = {};
    for (const p of priceRows) {
      priceMap[(p.description || '').toLowerCase().trim()] = {
        cif: Number(p.cif || 0),
        dp:  Number(p.dp  || 0),
      };
    }
    function lookupCif(name) { return priceMap[(name || '').toLowerCase().trim()]?.cif || 0; }
    function lookupDp(name)  { return priceMap[(name || '').toLowerCase().trim()]?.dp  || 0; }

    // Map: productName (normalised lower) → { productName, totalQty, totalCIF, totalDP, locations[] }
    const products = new Map();

    function upsert(productName, locationType, locationName, qty, cif, dp) {
      const key = (productName || '').toLowerCase().trim();
      if (!key || qty <= 0) return;
      if (!products.has(key)) {
        products.set(key, { productName, totalQty: 0, totalValueCIF: 0, totalValueDP: 0, locations: [] });
      }
      const p = products.get(key);
      p.productName = productName;   // keep original casing
      p.totalQty       += qty;
      p.totalValueCIF  += cif;
      p.totalValueDP   += dp;
      p.locations.push({ locationType, locationName, qty, valueCIF: parseFloat(cif.toFixed(2)), valueDP: parseFloat(dp.toFixed(2)) });
    }

    // Inventory balances (branches + warehouses)
    for (const r of invRows) {
      const qty    = Number(r.qty   || 0);
      const valDP  = Number(r.val_dp  || 0) || qty * Number(r.unit_dp  || lookupDp(r.product_name));
      const valCIF = Number(r.val_cif || 0) || qty * Number(r.unit_cif || lookupCif(r.product_name));
      const locType = r.location_type === 'warehouse' ? 'warehouse' : 'branch';
      upsert(r.product_name, locType, locLabel(locType, r.location_id), qty, valCIF, valDP);
    }

    // Stock batches (country_stock / warehouse batches not yet received)
    for (const r of batchRows) {
      const qty    = Number(r.qty     || 0);
      const valCIF = Number(r.val_cif || 0) || qty * Number(r.unit_cif || lookupCif(r.product_name));
      const valDP  = Number(r.val_dp  || 0) || qty * Number(r.unit_dp  || lookupDp(r.product_name));
      const locRaw = (r.location || '').toLowerCase();
      const locType = locRaw.includes('country') ? 'country_stock' : 'warehouse';
      const locName = locLabel(locType, r.location);
      upsert(r.product_name, locType, locName, qty, valCIF, valDP);
    }

    // Field stock
    for (const r of fieldRows) {
      const qty  = Number(r.qty || 0);
      const cif  = qty * lookupCif(r.product_name);
      const dp   = qty * lookupDp(r.product_name);
      const name = r.officer_name || r.team_name || 'Field Officer';
      upsert(r.product_name, 'field', `Field — ${name}`, qty, cif, dp);
    }

    // Sort products by DP value descending
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
      totalQtyUnits: parseFloat(productList.reduce((s, p) => s + p.totalQty, 0).toFixed(2)),
      totalValueCIF: parseFloat(productList.reduce((s, p) => s + p.totalValueCIF, 0).toFixed(2)),
      totalValueDP:  parseFloat(productList.reduce((s, p) => s + p.totalValueDP, 0).toFixed(2)),
    };

    res.json({ success: true, summary, products: productList });
  } catch (err) {
    console.error('[stock/current-overview]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
