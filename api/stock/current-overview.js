/**
 * GET /api/stock/current-overview
 * Countrywide stock snapshot — GM Portal "Current Stock" tab.
 *
 * Authoritative sources by location type:
 *
 *   Country Stock  → stock_batches WHERE location = 'country_stock'
 *   Warehouses     → stock_batches WHERE location IN (warehouse IDs)
 *     remaining_quantity is the physically accurate figure (decremented
 *     transactionally on every dispatch/receive). Only rows with
 *     remaining_quantity > 0 are included — zero-qty batches are excluded
 *     so they don't inflate totals via any fallback.
 *
 *   Branches   → inventory_balances WHERE location_type = 'branch'
 *     Derived from posted stock_movements. Falls back to product_prices
 *     unit prices where stored stock_value_* is zero.
 *
 *   Field      → field_stock balances, priced via product_prices.
 *     origin_location shown as source branch.
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
    const [branchRows, warehouseRows, fieldRows, priceRows] = await Promise.all([

      // ── Branches: inventory_balances (movement-derived cache) ──
      getMany(
        `SELECT location_id, product_name,
                SUM(closing_qty)                                          AS qty,
                SUM(stock_value_dp)                                       AS val_dp,
                SUM(COALESCE(stock_value_cif, closing_qty * unit_cif, 0)) AS val_cif,
                MAX(unit_dp)                                              AS unit_dp,
                MAX(unit_cif)                                             AS unit_cif
         FROM inventory_balances
         WHERE location_type = 'branch'
           AND closing_qty > 0
         GROUP BY location_id, product_name`
      ),

      // ── Warehouses only: stock_batches.remaining_quantity ──
      // Country stock is excluded — it is a staging/holding area, not active operations.
      getMany(
        `SELECT location, description AS product_name,
                SUM(remaining_quantity)                               AS qty,
                SUM(remaining_quantity * COALESCE(cif_unit_cost, 0))  AS val_cif,
                SUM(remaining_quantity * COALESCE(dpc_unit_value, 0)) AS val_dp,
                MAX(cif_unit_cost)                                    AS unit_cif,
                MAX(dpc_unit_value)                                   AS unit_dp
         FROM stock_batches
         WHERE remaining_quantity > 0
           AND COALESCE(status, '') != 'expired'
           AND location != 'country_stock'
         GROUP BY location, description`
      ),

      // ── Field stock: priced via GM price list ──
      getMany(
        `SELECT product_name,
                officer_name,
                COALESCE(origin_location, team_name, 'Field') AS source_branch,
                SUM(balance) AS qty
         FROM field_stock
         WHERE balance > 0
         GROUP BY product_name, officer_name, origin_location, team_name`
      ),

      // ── Price lookup for fallback / field stock pricing ──
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

    // Location-type classifier for stock_batches rows
    const COUNTRY_LOCS  = new Set(['country_stock']);
    const WAREHOUSE_LOCS = new Set(['windhoek_warehouse', 'ondangwa_warehouse']);
    function batchLocType(loc) {
      if (COUNTRY_LOCS.has(loc))   return 'country';
      if (WAREHOUSE_LOCS.has(loc)) return 'warehouse';
      return 'warehouse'; // unknown warehouse IDs default to warehouse
    }

    const products = new Map();

    function upsert(productName, locationType, locationName, qty, cif, dp) {
      const key = (productName || '').toLowerCase().trim();
      if (!key || qty <= 0) return;
      if (!products.has(key)) {
        products.set(key, { productName, totalQty: 0, totalValueCIF: 0, totalValueDP: 0, locations: [] });
      }
      const p = products.get(key);
      p.productName    = productName;
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

    // ── Branch rows ──
    for (const r of branchRows) {
      const qty    = Number(r.qty     || 0);
      const unitDP  = Number(r.unit_dp  || 0) || lookupDp(r.product_name);
      const unitCIF = Number(r.unit_cif || 0) || lookupCif(r.product_name);
      const valDP  = Number(r.val_dp  || 0) || qty * unitDP;
      const valCIF = Number(r.val_cif || 0) || qty * unitCIF;
      upsert(r.product_name, 'branch', locLabel(r.location_id), qty, valCIF, valDP);
    }

    // ── Warehouse + Country Stock rows (from stock_batches) ──
    for (const r of warehouseRows) {
      const qty    = Number(r.qty     || 0);
      const valDP  = Number(r.val_dp  || 0) || qty * lookupDp(r.product_name);
      const valCIF = Number(r.val_cif || 0) || qty * lookupCif(r.product_name);
      upsert(r.product_name, batchLocType(r.location), locLabel(r.location), qty, valCIF, valDP);
    }

    // ── Field stock ──
    for (const r of fieldRows) {
      const qty      = Number(r.qty || 0);
      const srcLabel = locLabel(r.source_branch);
      const label    = r.officer_name
        ? `${r.officer_name} (from ${srcLabel})`
        : `Field — ${srcLabel}`;
      upsert(r.product_name, 'field', label, qty,
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
