/**
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
    const warehouseRows = await query(`
      WITH sb AS (
        -- All stock_batches rows sitting in a warehouse location
        SELECT
          MIN(sb.id)       AS batch_id,
          sb.location      AS warehouse_id,
          wl.name          AS warehouse_name,
          MIN(sb.description) AS product_name,
          MIN(sb.product_id) AS product_id,
          COALESCE(sb.batch_no, '') AS batch_no,
          MIN(sb.expiry_date) AS expiry_date,
          SUM(sb.remaining_quantity) AS remaining_quantity
        FROM stock_batches sb
        JOIN warehouse_locations wl ON wl.id = sb.location AND wl.type = 'warehouse'
        WHERE COALESCE(sb.status, '') != 'expired'
        GROUP BY sb.location, wl.name, LOWER(TRIM(sb.description)), COALESCE(sb.batch_no, '')
      ),
      wi AS (
        -- Matching warehouse_inventory overlay rows
        SELECT
          wi.warehouse_id,
          MIN(wi.product_name) AS product_name,
          COALESCE(wi.batch_no, '') AS batch_no,
          SUM(wi.quantity) AS wi_quantity
        FROM warehouse_inventory wi
        JOIN warehouse_locations wl ON wl.id = wi.warehouse_id AND wl.type = 'warehouse'
        GROUP BY wi.warehouse_id, LOWER(TRIM(wi.product_name)), COALESCE(wi.batch_no, '')
      ),
      ib_wh AS (
        -- inventory_balances for warehouse locations
        SELECT
          location_id,
          LOWER(TRIM(product_name)) AS product_key,
          COALESCE(batch_no, '')    AS batch_no,
          SUM(closing_qty)          AS ib_closing_qty
        FROM inventory_balances
        WHERE location_type = 'warehouse'
        GROUP BY location_id, LOWER(TRIM(product_name)), COALESCE(batch_no, '')
      )
      SELECT
        COALESCE(sb.warehouse_id, wi.warehouse_id, ib.location_id) AS warehouse_id,
        sb.warehouse_name,
        COALESCE(sb.product_name, wi.product_name, ib.product_key) AS product_name,
        sb.product_id,
        COALESCE(sb.batch_no, wi.batch_no, ib.batch_no) AS batch_no,
        sb.expiry_date,
        sb.remaining_quantity          AS fefo_qty,
        wi.wi_quantity,
        ib.ib_closing_qty,
        -- Authoritative figure: wi_quantity if an overlay exists, else fefo_qty
        COALESCE(sb.remaining_quantity, 0) AS authoritative_qty,
        -- Drift = authoritative FEFO/overlay figure minus movement-cache figure
        ROUND(
          COALESCE(sb.remaining_quantity, 0)
          - COALESCE(ib.ib_closing_qty, 0)
        , 4) AS drift
      FROM sb
      FULL OUTER JOIN wi
        ON wi.warehouse_id = sb.warehouse_id
       AND LOWER(TRIM(wi.product_name)) = LOWER(TRIM(sb.product_name))
       AND COALESCE(wi.batch_no, '') IS NOT DISTINCT FROM COALESCE(sb.batch_no, '')
      FULL OUTER JOIN ib_wh ib
        ON ib.location_id = COALESCE(sb.warehouse_id, wi.warehouse_id)
       AND ib.product_key = LOWER(TRIM(COALESCE(sb.product_name, wi.product_name)))
       AND ib.batch_no = COALESCE(sb.batch_no, wi.batch_no, '')
      ORDER BY warehouse_id, product_name, batch_no NULLS LAST
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // BRANCH reconciliation
    // branch_inventory_batches (sum per branch+product) vs inventory_balances
    // ──────────────────────────────────────────────────────────────────────────
    const branchRows = await query(`
      WITH bib AS (
        SELECT
          branch_id,
          LOWER(TRIM(product_name)) AS product_key,
          MIN(product_name) AS product_name,
          SUM(quantity) AS bib_qty
        FROM branch_inventory_batches
        GROUP BY branch_id, LOWER(TRIM(product_name))
      ),
      ib_br AS (
        SELECT
          location_id,
          LOWER(TRIM(product_name)) AS product_key,
          SUM(closing_qty)          AS ib_closing_qty
        FROM inventory_balances
        WHERE location_type = 'branch'
        GROUP BY location_id, LOWER(TRIM(product_name))
      )
      SELECT
        COALESCE(bib.branch_id, ib.location_id)   AS branch_id,
        COALESCE(bib.product_name,
          (SELECT product_name FROM inventory_balances
           WHERE location_type='branch'
             AND location_id = ib.location_id
             AND LOWER(TRIM(product_name)) = ib.product_key
           LIMIT 1)
        )                                           AS product_name,
        COALESCE(bib.bib_qty, 0)                   AS bib_qty,
        COALESCE(ib.ib_closing_qty, 0)             AS ib_closing_qty,
        ROUND(
          COALESCE(bib.bib_qty, 0)
          - COALESCE(ib.ib_closing_qty, 0)
        , 4)                                        AS drift
      FROM bib
      FULL OUTER JOIN ib_br ib
        ON ib.location_id = bib.branch_id
       AND ib.product_key = bib.product_key
      ORDER BY COALESCE(bib.branch_id, ib.location_id), COALESCE(bib.product_name, ib.product_key)
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // For every drifted row, fetch the last 10 stock_movements for context
    // ──────────────────────────────────────────────────────────────────────────
    const driftedWarehouses = warehouseRows.rows.filter(r => Number(r.drift) !== 0);
    const driftedBranches   = branchRows.rows.filter(r => Number(r.drift) !== 0);

    // Build movement lookup: locationId|productName → [movements]
    const movementCache = {};

    const fetchMovements = async (locationId, productName) => {
      const cacheKey = `${locationId}|${(productName || '').toLowerCase()}`;
      if (movementCache[cacheKey]) return;
      const result = await query(
        `SELECT id, movement_type, quantity, source_location, destination_location,
                source_location_type, destination_location_type,
                batch_no, status, notes, created_by, created_at
         FROM stock_movements
         WHERE status IN ('posted', 'approved')
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
           AND (source_location = $2 OR destination_location = $2)
         ORDER BY created_at DESC
         LIMIT 10`,
        [productName, locationId]
      );
      movementCache[cacheKey] = result.rows.map(m => ({
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
        createdAt: m.created_at,
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
    const warehouses = warehouseRows.rows.map(r => {
      const drift = Number(r.drift);
      const cacheKey = `${r.warehouse_id}|${(r.product_name || '').toLowerCase()}`;
      return {
        warehouseId:    r.warehouse_id,
        warehouseName:  r.warehouse_name || r.warehouse_id,
        productName:    r.product_name,
        productId:      r.product_id,
        batchNo:        r.batch_no,
        expiryDate:     r.expiry_date,
        // The three stores
        fefoQty:        Number(r.fefo_qty ?? 0),
        wiQty:          r.wi_quantity != null ? Number(r.wi_quantity) : null,
        ibQty:          Number(r.ib_closing_qty ?? 0),
        // Which figure is authoritative on this row
        authoritativeQty: Number(r.authoritative_qty ?? 0),
        // api source note
        fefoApiSource:  'api/warehouse/inventory.js (UNION stock_batches)',
        ibApiSource:    'server.js:1821 GET /api/stock/warehouse/:id/inventory',
        drift,
        hasDrift:       drift !== 0 || (r.wi_quantity != null && Number(r.wi_quantity) !== Number(r.fefo_qty || 0)),
        movements:      drift !== 0 ? (movementCache[cacheKey] || []) : [],
      };
    });

    const branches = branchRows.rows.map(r => {
      const drift = Number(r.drift);
      const cacheKey = `${r.branch_id}|${(r.product_name || '').toLowerCase()}`;
      return {
        branchId:    r.branch_id,
        productName: r.product_name,
        // The two stores
        bibQty:      Number(r.bib_qty ?? 0),
        ibQty:       Number(r.ib_closing_qty ?? 0),
        drift,
        hasDrift:    drift !== 0,
        movements:   drift !== 0 ? (movementCache[cacheKey] || []) : [],
      };
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        warehouseRows:   warehouses.length,
        warehouseDrift:  warehouses.filter(r => r.hasDrift).length,
        branchRows:      branches.length,
        branchDrift:     branches.filter(r => r.hasDrift).length,
      },
      warehouses,
      branches,
    });
  } catch (err) {
    console.error('[stock-reconciliation]', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
