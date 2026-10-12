/**
 * GET /api/stock/realtime
 * Unified product-level stock snapshot across operational locations:
 *   - warehouses  (stock_batches WHERE location LIKE '%warehouse%')
 *   - branches    (branch_inventory_batches — authoritative per-branch source)
 *
 * country_stock is EXCLUDED — it is staging/holding stock, not yet operational.
 * Branch stock is sourced ONLY from branch_inventory_batches to avoid double-counting
 * with any branch-like rows that may exist in stock_batches.
 *
 * Source of truth: stock_batches.remaining_quantity (NOT inventory_balances,
 * which accumulates historical period rows and would massively inflate figures).
 *
 * Each product: { name, totalQty, locations: [{ locationId, locationName, locationType, qty }] }
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import {getDailySales,businessToday,COMPANY_REPORT_ROLES} from '../services/dailySales.js';

const STATIC_NAMES = {
  country_stock:      'Country Stock',
  windhoek_warehouse: 'Windhoek Warehouse',
  ondangwa_warehouse: 'Ondangwa Warehouse',
  oshakati_warehouse: 'Oshakati Warehouse',
  rundu_warehouse:    'Rundu Warehouse',
};

function locationType(id) {
  if (id === 'country_stock') return 'country';
  if ((id || '').includes('warehouse')) return 'warehouse';
  return 'branch';
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if(!req.user)return res.status(401).json({success:false,error:'Authentication required'});
  if(!COMPANY_REPORT_ROLES.has(String(req.user.role).toLowerCase()))
    return res.status(403).json({success:false,error:'Company reporting access required'});

  try {
    const [warehouseRows, branchRows, branchNames, recentMovements, branchMovements, recentSales] = await Promise.all([
      // stock_batches is the live source of truth for WAREHOUSE quantities only.
      // Exclude country_stock (staging/holding) and any non-warehouse location rows.
      // remaining_quantity is updated in real-time on every movement.
      // Group by location + description because multiple batches of the same product
      // exist per location (different expiry dates / batch numbers).
      getMany(
        `SELECT location AS location_id,
                description AS product_name,
                SUM(remaining_quantity) AS qty
         FROM stock_batches
         WHERE remaining_quantity > 0
           AND COALESCE(status, 'active') != 'expired'
           AND location LIKE '%warehouse%'
         GROUP BY location, description
         ORDER BY location, description`
      ),
      // branch_inventory_batches is the authoritative current stock for branches.
      getMany(
        `SELECT branch_id, product_name, SUM(quantity) AS qty
         FROM branch_inventory_batches
         WHERE quantity > 0
         GROUP BY branch_id, product_name
         ORDER BY branch_id, product_name`
      ),
      getMany(`SELECT id, name FROM branches WHERE status = 'active'`),
      // Recent warehouse-level movements
      getMany(
        `SELECT sm.id, sm.product_name, sm.movement_type, sm.quantity,
                sm.source_location, sm.destination_location,
                sm.created_at, sm.created_by, sm.reference_id,
                sm.batch_no, sm.expiry_date
         FROM stock_movements sm
         ORDER BY sm.created_at DESC LIMIT 40`
      ),
      // Recent branch-level movements (sales, dispenses, write-offs, receipts)
      getMany(
        `SELECT bm.id, bm.product_name, bm.type AS movement_type, bm.quantity,
                bm.branch_id AS source_location,
                NULL::text AS destination_location,
                bm.created_at, bm.created_by, bm.reference AS reference_id,
                bm.batch_no, NULL::date AS expiry_date
         FROM branch_inventory_movements bm
         ORDER BY bm.created_at DESC LIMIT 40`
      ),
      getDailySales(businessToday()),
    ]);

    const branchNameMap = Object.fromEntries(branchNames.map(b => [b.id, b.name]));

    const resolveLocationName = (id) =>
      STATIC_NAMES[id]
      || branchNameMap[id]
      || (id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const productMap = new Map();

    const upsert = (rawName, locationId, qty) => {
      const name = (rawName || '').trim();
      if (!name || Number(qty) <= 0) return;
      if (!productMap.has(name)) productMap.set(name, { name, totalQty: 0, locations: [] });
      const entry = productMap.get(name);
      entry.totalQty += Number(qty);
      entry.locations.push({
        locationId,
        locationName: resolveLocationName(locationId),
        locationType: locationType(locationId),
        qty: Number(qty),
      });
    };

    for (const r of warehouseRows) upsert(r.product_name, r.location_id, r.qty);
    for (const r of branchRows)    upsert(r.product_name, r.branch_id, r.qty);

    const products = [...productMap.values()]
      .sort((a, b) => b.totalQty - a.totalQty)
      .map(p => ({ ...p, locations: p.locations.sort((a, b) => b.qty - a.qty) }));

    // Merge warehouse + branch movements, deduplicated, sorted newest-first, cap at 60.
    // Branch sales (e.g. walk_in_non_member_sale) can appear in BOTH stock_movements
    // (source_location = branch_id) AND branch_inventory_movements. Prefer the branch
    // record and drop the matching warehouse duplicate so the feed shows each sale once.
    const toTs = v => v ? new Date(v).toISOString().slice(0, 19) : '';
    const branchMovementKeys = new Set(
      branchMovements.map(m => `${m.product_name}|${m.movement_type}|${m.quantity}|${toTs(m.created_at)}`)
    );
    const deduplicatedWarehouse = recentMovements.filter(m => {
      const key = `${m.product_name}|${m.movement_type}|${m.quantity}|${toTs(m.created_at)}`;
      return !branchMovementKeys.has(key);
    });
    const allMovements = [
      ...deduplicatedWarehouse.map(m => ({ ...m, _source: 'warehouse' })),
      ...branchMovements.map(m => ({ ...m, _source: 'branch' })),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 60);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      products,
      totalProducts: products.length,
      totalUnits: products.reduce((s, p) => s + p.totalQty, 0),
      recentMovements: allMovements.map(m=>({...m,
        sourceLocationName:resolveLocationName(m.source_location),
        destinationLocationName:m.destination_location?resolveLocationName(m.destination_location):null})),
      todayStats: {
        salesCount: recentSales.summary.totalTransactions,
        revenue: recentSales.summary.totalRevenue,
        date:recentSales.date,scope:recentSales.scope,timezone:recentSales.timezone,
        revenueBasis:recentSales.summary.revenueBasis,
        walkinCustomerReceipts:recentSales.summary.walkinCustomerReceipts,
        matchedOriginalChargedRevenue:recentSales.summary.matchedOriginalChargedRevenue,
        dpComplete:recentSales.summary.dpComplete,
      },
    });
  } catch (err) {
    console.error('[stock/realtime]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
