import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
 * GET /api/admin/stock-reconciliation
 *
 * Admin-only diagnostic endpoint that surfaces the three warehouse stock stores
 * and two branch stock stores side-by-side so the team can spot drift instantly.
 *
 * Warehouse stores (per warehouse / product / batch):
 *   1. stock_batches.remaining_quantity      — FEFO physical batch counter
 *   2. warehouse_inventory.quantity          — adjustment overlay (null if absent)
 *   3. inventory_balances.closing_qty        — movement-cache recomputed by stockEngine
 *
 * Branch stores (per branch / product):
 *   1. SUM(branch_inventory_batches.quantity) — authoritative batch-level counter
 *   2. inventory_balances.closing_qty          — movement-cache fallback
 *
 * For any row where the stores differ the endpoint also returns the last 10
 * stock_movements for that location+product so the cause can be traced.
 */

import { query } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // WAREHOUSE reconciliation
    // Combines stock_batches (FEFO), warehouse_inventory (overlay), and
    // inventory_balances (movement cache) for every known warehouse location.
    // ──────────────────────────────────────────────────────────────────────────
    const warehouseRows = await __qd_executePlan(query, __qd_registeredPlan("api/admin/stock-reconciliation.js:44:0"), []);



































































    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH reconciliation
    // branch_inventory_batches (sum per branch+product) vs inventory_balances
    // ──────────────────────────────────────────────────────────────────────────
    const branchRows = await __qd_executePlan(query, __qd_registeredPlan("api/admin/stock-reconciliation.js:116:1"), []);








































    // ──────────────────────────────────────────────────────────────────────────
    // For every drifted row, fetch the last 10 stock_movements for context
    // ──────────────────────────────────────────────────────────────────────────
    const driftedWarehouses = warehouseRows.rows.filter((r) => Number(r.drift) !== 0);
    const driftedBranches = branchRows.rows.filter((r) => Number(r.drift) !== 0);

    // Build movement lookup: locationId|productName → [movements]
    const movementCache = {};

    const fetchMovements = async (locationId, productName) => {
      const cacheKey = `${locationId}|${(productName || '').toLowerCase()}`;
      if (movementCache[cacheKey]) return;
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/admin/stock-reconciliation.js:170:2"),









      [productName, locationId]);

      movementCache[cacheKey] = result.rows.map((m) => ({
        id: m.id,
        movementType: m.movement_type,
        quantity: Number(m.quantity),
        sourceLocation: m.source_location,
        destinationLocation: m.destination_location,
        sourceLocationType: m.source_location_type,
        destinationLocationType: m.destination_location_type,
        batchNo: m.batch_no,
        status: m.status,
        notes: m.notes,
        createdBy: m.created_by,
        createdAt: m.created_at
      }));
    };

    // Fetch movements for all drifted rows (sequential to avoid hammering DB)
    for (const r of driftedWarehouses) {
      await fetchMovements(r.warehouse_id, r.product_name);
    }
    for (const r of driftedBranches) {
      await fetchMovements(r.branch_id, r.product_name);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Shape the response
    // ──────────────────────────────────────────────────────────────────────────
    const warehouses = warehouseRows.rows.map((r) => {
      const drift = Number(r.drift);
      const cacheKey = `${r.warehouse_id}|${(r.product_name || '').toLowerCase()}`;
      return {
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name || r.warehouse_id,
        productName: r.product_name,
        productId: r.product_id,
        batchNo: r.batch_no,
        expiryDate: r.expiry_date,
        // The three stores
        fefoQty: Number(r.fefo_qty ?? 0),
        wiQty: r.wi_quantity != null ? Number(r.wi_quantity) : null,
        ibQty: Number(r.ib_closing_qty ?? 0),
        // Which figure is authoritative on this row
        authoritativeQty: Number(r.authoritative_qty ?? 0),
        // api source note
        fefoApiSource: 'api/warehouse/inventory.js (UNION stock_batches)',
        ibApiSource: 'server.js:1821 GET /api/stock/warehouse/:id/inventory',
        drift,
        hasDrift: drift !== 0 || r.wi_quantity != null && Number(r.wi_quantity) !== Number(r.fefo_qty || 0),
        movements: drift !== 0 ? movementCache[cacheKey] || [] : []
      };
    });

    const branches = branchRows.rows.map((r) => {
      const drift = Number(r.drift);
      const cacheKey = `${r.branch_id}|${(r.product_name || '').toLowerCase()}`;
      return {
        branchId: r.branch_id,
        productName: r.product_name,
        // The two stores
        bibQty: Number(r.bib_qty ?? 0),
        ibQty: Number(r.ib_closing_qty ?? 0),
        drift,
        hasDrift: drift !== 0,
        movements: drift !== 0 ? movementCache[cacheKey] || [] : []
      };
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        warehouseRows: warehouses.length,
        warehouseDrift: warehouses.filter((r) => r.hasDrift).length,
        branchRows: branches.length,
        branchDrift: branches.filter((r) => r.hasDrift).length
      },
      warehouses,
      branches
    });
  } catch (err) {
    console.error('[stock-reconciliation]', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
