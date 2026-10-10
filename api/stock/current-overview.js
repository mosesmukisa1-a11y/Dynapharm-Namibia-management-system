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
 *   Branches → canonical physical source layers, reservations and segregation.
 *     Original received costs are retained; unmatched cached balances and current
 *     catalogue prices never supply physical stock or historical source costs.
 *
 *   Field → legacy custody quantities; source costs explicitly unverified.
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import {getStockCostProjection} from '../services/stockCostReporting.js';

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
    const [layers, fieldRows, priceRows, branchNames] = await Promise.all([
      // One physical/status snapshot, with immutable received source costs.
      // Cached closing balances and today's price list are not physical evidence.
      getStockCostProjection(),

      // ── Legacy field custody, without inferred cost provenance ──
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
      getMany(`SELECT description, cif, dp FROM live_product_prices WHERE dp > 0 OR cif > 0 ORDER BY description`),
      getMany('SELECT id,name FROM branches'),
    ]);
    const names=new Map(branchNames.map(r=>[normalizeBranchSlug(r.id),r.name]));
    const stats=r=>({availableQty:r.availableQty,reservedQty:r.reservedQty,
      quarantinedQty:r.quarantinedQty,expiredQty:r.expiredQty,inTransitQty:r.inTransitQty,
      missingCostQuantity:r.missingCostQuantity,missingDPQuantity:r.missingDPCQuantity});
    const branchRows=layers.filter(r=>r.locationType==='branch').map(r=>({
      location_id:r.location,location_name:names.get(normalizeBranchSlug(r.location)) || locLabel(r.location),
      product_name:r.productName,qty:r.qty,val_dp:r.qty*(r.unitDPC ?? 0),val_cif:r.qty*(r.unitCIF ?? 0),...stats(r)}));
    const ibRows=[]; // Unmatched cached quantities stay in read-only reconciliation, not added stock.
    const warehouseRows=layers.filter(r=>r.locationType!=='branch').map(r=>({
      location:r.location,location_type:r.locationType,product_name:r.productName,
      qty:r.qty,val_dp:r.qty*(r.unitDPC ?? 0),val_cif:r.qty*(r.unitCIF ?? 0),...stats(r)}));
    const statusKeys=['availableQty','reservedQty','quarantinedQty','expiredQty','inTransitQty','missingCostQuantity','missingDPQuantity'];

    // Location-type classifier for stock_batches rows
    const COUNTRY_LOCS  = new Set(['country_stock']);
    const WAREHOUSE_LOCS = new Set(['windhoek_warehouse', 'ondangwa_warehouse']);
    function batchLocType(loc) {
      if (COUNTRY_LOCS.has(loc))   return 'country';
      if (WAREHOUSE_LOCS.has(loc)) return 'warehouse';
      return 'warehouse'; // unknown warehouse IDs default to warehouse
    }

    const products = new Map();

    function upsert(productName, locationType, locationName, qty, cif, dp, state={}) {
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
      for(const name of statusKeys)p[name]=(p[name] || 0)+Number(state[name] || 0);
      p.locations.push({
        locationType,
        locationName,
        locationId:locationType==='branch'?state.location_id:(state.location || null),
        qty,
        valueCIF: parseFloat(cif.toFixed(2)),
        valueDP:  parseFloat(dp.toFixed(2)),
        ...Object.fromEntries(statusKeys.map(name=>[name,Number(state[name] || 0)])),
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
      for(const name of statusKeys)agg[name]=(agg[name] || 0)+Number(r[name] || 0);
      if (Number(r.unit_dp  || 0) > 0) agg.unit_dp  = Number(r.unit_dp);
      if (Number(r.unit_cif || 0) > 0) agg.unit_cif = Number(r.unit_cif);
      // Prefer the real branch name from the branches table over a raw slug
      if (r.location_name && r.location_name !== r.location_id) {
        agg.location_name = r.location_name;
      }
    }

    // Primary: branch_inventory_batches (authoritative physical quantities).
    // Track which canonical (branch, product) pairs are already covered by BIB
    // so the inventory_balances fallback below never double-counts for branches
    // stored under alias IDs (e.g. 'oshakati' vs 'oshakati_branch', 'katima'
    // vs 'katima_mulilo'). The NOT EXISTS guard in the ibRows SQL query only
    // does a simple space→underscore normalisation and misses these aliases —
    // the JS-side guard here handles all variants via normalizeBranchSlug.
    const bibCoveredKeys = new Set();
    for (const r of branchRows) {
      mergeBranchRow(r);
      const canonId = normalizeBranchSlug(r.location_id) || r.location_id;
      bibCoveredKeys.add(`${canonId}||${(r.product_name || '').toLowerCase().trim()}`);
    }

    // Fallback: inventory_balances ONLY for (branch, product) combos that
    // branch_inventory_batches does NOT already cover under ANY alias variant.
    for (const r of ibRows) {
      const canonId = normalizeBranchSlug(r.location_id) || r.location_id;
      const key     = `${canonId}||${(r.product_name || '').toLowerCase().trim()}`;
      if (!bibCoveredKeys.has(key)) {
        mergeBranchRow(r);
      }
    }

    // ── Branch rows ──
    for (const r of branchMerged.values()) {
      const qty     = Number(r.qty     || 0);
      const valDP   = Number(r.val_dp || 0);
      const valCIF  = Number(r.val_cif || 0);
      // Use the real branch name from the branches table (r.location_name)
      upsert(r.product_name, 'branch', r.location_name || locLabel(r.location_id), qty, valCIF, valDP,r);
    }

    // ── Warehouse + Country Stock rows (from stock_batches) ──
    for (const r of warehouseRows) {
      const qty    = Number(r.qty     || 0);
      const valDP  = Number(r.val_dp || 0);
      const valCIF = Number(r.val_cif || 0);
      upsert(r.product_name, r.location_type || batchLocType(r.location), locLabel(r.location), qty, valCIF, valDP,r);
    }

    // ── Field stock ──
    for (const r of fieldRows) {
      const qty      = Number(r.qty || 0);
      const srcLabel = locLabel(r.source_branch);
      const label    = r.officer_name
        ? `${r.officer_name} (from ${srcLabel})`
        : `Field — ${srcLabel}`;
      // Legacy field custody has no frozen source-cost evidence in this register.
      upsert(r.product_name, 'field', label, qty,0,0,{missingCostQuantity:qty,missingDPQuantity:qty});
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
      ...Object.fromEntries(statusKeys.map(name=>[name,productList.reduce((n,p)=>n+(p[name] || 0),0)])),
    };
    summary.valuationComplete=!summary.missingCostQuantity && !summary.missingDPQuantity;

    res.json({ success: true, summary, products: productList, zeroStockProducts });
  } catch (err) {
    console.error('[stock/current-overview]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
