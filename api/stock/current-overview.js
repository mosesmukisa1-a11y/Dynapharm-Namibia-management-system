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
import { ALL_BRANCH_LOCATION_ALIASES, normalizeBranchSlug } from '../_lib/branchUtils.js';

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
    const [branchRows, ibRows, warehouseRows, fieldRows, priceRows] = await Promise.all([

      // ── Branches primary: branch_inventory_batches (authoritative source) ──
      // Reading branch_inventory_batches directly always reflects the exact physical
      // quantities because every movement path (sales, write-offs, transfers, returns,
      // dispenses) transactionally updates this table.
      getMany(
        `SELECT b.branch_id AS location_id,
                COALESCE(br.name, b.branch_id) AS location_name,
                b.product_name,
                SUM(b.quantity)                                AS qty,
                SUM(b.quantity * COALESCE(p.dp,  0))          AS val_dp,
                SUM(b.quantity * COALESCE(p.cif, 0))          AS val_cif,
                MAX(p.dp)                                      AS unit_dp,
                MAX(p.cif)                                     AS unit_cif
         FROM branch_inventory_batches b
         LEFT JOIN branches br ON br.id = b.branch_id
            OR br.id = CASE b.branch_id
              WHEN 'oshakati_branch' THEN 'oshakati'
              WHEN 'oshakati'        THEN 'oshakati_branch'
              WHEN 'katima_mulilo'   THEN 'katima'
              WHEN 'katima'          THEN 'katima_mulilo'
              ELSE NULL END
         LEFT JOIN product_prices p
               ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
         WHERE b.quantity > 0
         GROUP BY b.branch_id, br.name, b.product_name`
      ),

      // ── Branches fallback: inventory_balances for products not in branch_inventory_batches ──
      // Catches any edge case where a movement updated inventory_balances (via stockEngine
      // recompute) but the corresponding branch_inventory_batches row is missing or was
      // not yet created (e.g. older import paths, legacy data).
      getMany(
        `SELECT ib.location_id,
                COALESCE(br.name, ib.location_id) AS location_name,
                ib.product_name,
                ib.closing_qty                            AS qty,
                ib.closing_qty * COALESCE(p.dp,  0)      AS val_dp,
                ib.closing_qty * COALESCE(p.cif, 0)      AS val_cif,
                COALESCE(p.dp,  0)                        AS unit_dp,
                COALESCE(p.cif, 0)                        AS unit_cif
         FROM inventory_balances ib
         LEFT JOIN branches br ON LOWER(TRIM(br.id)) = LOWER(TRIM(ib.location_id))
         LEFT JOIN product_prices p ON LOWER(TRIM(p.description)) = LOWER(TRIM(ib.product_name))
         WHERE ib.location_type = 'branch'
           AND ib.closing_qty > 0
           AND NOT EXISTS (
             SELECT 1 FROM branch_inventory_batches bib
             WHERE LOWER(REPLACE(bib.branch_id,' ','_')) = LOWER(REPLACE(ib.location_id,' ','_'))
               AND LOWER(TRIM(bib.product_name)) = LOWER(TRIM(ib.product_name))
               AND bib.quantity > 0
           )`
      ),

      // ── Warehouses + Country Stock: stock_batches.remaining_quantity ──
      // LEFT JOIN product_prices so batches without an exact price-catalogue
      // match are still included (prices fall back to 0 / lookupCif/Dp).
      // Country stock is included so the GM sees the complete picture.
      // IMPORTANT: exclude all known branch IDs from stock_batches so that
      // any batch that was mistakenly imported under a branch location, or whose
      // remaining_quantity was not zeroed after dispatch, does not double-count
      // with the branch_inventory_batches query above.
      getMany(
        `SELECT sb.location, sb.description AS product_name,
                SUM(sb.remaining_quantity)                                   AS qty,
                SUM(sb.remaining_quantity * COALESCE(sb.cif_unit_cost, 0))  AS val_cif,
                SUM(sb.remaining_quantity * COALESCE(sb.dpc_unit_value, 0)) AS val_dp,
                MAX(sb.cif_unit_cost)                                        AS unit_cif,
                MAX(sb.dpc_unit_value)                                       AS unit_dp
         FROM stock_batches sb
         LEFT JOIN product_prices pp
               ON LOWER(TRIM(pp.description)) = LOWER(TRIM(sb.description))
         WHERE sb.remaining_quantity > 0
           AND COALESCE(sb.status, '') != 'expired'
           AND sb.location != ALL($1::text[])
         GROUP BY sb.location, sb.description`,
        [ALL_BRANCH_LOCATION_ALIASES]
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

      // ── Price lookup for fallback / field stock pricing + zero-stock product list ──
      getMany(`SELECT description, cif, dp FROM product_prices WHERE dp > 0 OR cif > 0 ORDER BY description`),
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

    // ── Normalize + merge branch rows ────────────────────────────────────────
    // branch_inventory_batches may have rows stored under alias IDs (e.g.
    // 'katima' alongside 'katima_mulilo', 'hochlandpark' alongside
    // 'hochland-park'). Normalize every branch_id to its canonical slug and
    // merge matching rows so each branch shows as a single row per product.
    // inventory_balances (ibRows) fills in any product/branch combos that
    // branch_inventory_batches missed (legacy data or edge-case movement paths).
    const branchMerged = new Map(); // key: `${canonicalId}||${productLower}`

    function mergeBranchRow(r) {
      const canonId = normalizeBranchSlug(r.location_id) || r.location_id;
      const key     = `${canonId}||${(r.product_name || '').toLowerCase().trim()}`;
      if (!branchMerged.has(key)) {
        branchMerged.set(key, {
          location_id:   canonId,
          // Prefer the name resolved via the branches JOIN (real branch name).
          // Alias rows where the JOIN missed will have location_name === location_id;
          // we keep updating so whichever row has a real name wins.
          location_name: r.location_name,
          product_name:  r.product_name,
          qty:    0, val_dp:  0, val_cif: 0,
          unit_dp: 0, unit_cif: 0,
        });
      }
      const agg = branchMerged.get(key);
      agg.qty     += Number(r.qty     || 0);
      agg.val_dp  += Number(r.val_dp  || 0);
      agg.val_cif += Number(r.val_cif || 0);
      if (Number(r.unit_dp  || 0) > 0) agg.unit_dp  = Number(r.unit_dp);
      if (Number(r.unit_cif || 0) > 0) agg.unit_cif = Number(r.unit_cif);
      // Prefer the real branch name from the branches table over a raw slug
      if (r.location_name && r.location_name !== r.location_id) {
        agg.location_name = r.location_name;
      }
    }

    // Primary: branch_inventory_batches (authoritative physical quantities)
    for (const r of branchRows) mergeBranchRow(r);
    // Fallback: inventory_balances for any product/branch NOT already in the primary set
    for (const r of ibRows) mergeBranchRow(r);

    // ── Branch rows ──
    for (const r of branchMerged.values()) {
      const qty     = Number(r.qty     || 0);
      const unitDP  = Number(r.unit_dp  || 0) || lookupDp(r.product_name);
      const unitCIF = Number(r.unit_cif || 0) || lookupCif(r.product_name);
      const valDP   = Number(r.val_dp  || 0) || qty * unitDP;
      const valCIF  = Number(r.val_cif || 0) || qty * unitCIF;
      // Use the real branch name from the branches table (r.location_name)
      upsert(r.product_name, 'branch', r.location_name || locLabel(r.location_id), qty, valCIF, valDP);
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

    // ── Zero-stock products: all priced products not already in the stock map ──
    const inStockKeys = new Set(Array.from(products.keys()));
    const zeroStockProducts = priceRows
      .filter(p => !inStockKeys.has((p.description || '').toLowerCase().trim()))
      .map(p => ({
        productName:    p.description,
        totalQty:       0,
        totalValueCIF:  0,
        totalValueDP:   0,
        locations:      [],
        unitDP:         Number(p.dp  || 0),
        unitCIF:        Number(p.cif || 0),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName));

    const summary = {
      productCount:         productList.length,
      totalQtyUnits:        parseFloat(productList.reduce((s, p) => s + p.totalQty,      0).toFixed(2)),
      totalValueCIF:        parseFloat(productList.reduce((s, p) => s + p.totalValueCIF, 0).toFixed(2)),
      totalValueDP:         parseFloat(productList.reduce((s, p) => s + p.totalValueDP,  0).toFixed(2)),
      zeroStockCount:       zeroStockProducts.length,
      totalProductsInCatalogue: productList.length + zeroStockProducts.length,
    };

    res.json({ success: true, summary, products: productList, zeroStockProducts });
  } catch (err) {
    console.error('[stock/current-overview]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
