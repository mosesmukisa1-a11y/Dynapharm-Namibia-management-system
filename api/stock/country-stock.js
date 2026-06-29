import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';
import { recomputeInventoryBalance, recomputeLocationBalances, inferLocationType } from '../services/stockEngine.js';
import { publishRealtimeEvent } from '../db.js';

/**
 * Recompute inventory_balances for every location that has ever had
 * a stock_movement for the given product+batch combination.
 */
async function recomputeAllLocationsForBatch(productName, batchNoKey) {
  const result = await query(
    `SELECT DISTINCT
       COALESCE(source_location_type, NULL) AS loc_type, source_location AS loc_id
     FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
       AND COALESCE(batch_no, '') = $2
       AND source_location IS NOT NULL
     UNION
     SELECT DISTINCT
       COALESCE(destination_location_type, NULL) AS loc_type, destination_location AS loc_id
     FROM stock_movements
     WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
       AND COALESCE(batch_no, '') = $2
       AND destination_location IS NOT NULL`,
    [productName, batchNoKey]
  );

  const seen = new Set();
  for (const row of result.rows) {
    const locType = row.loc_type || inferLocationType(row.loc_id);
    if (!locType || !row.loc_id) continue;
    const key = `${locType}::${row.loc_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await recomputeInventoryBalance({
        locationType: locType,
        locationId: row.loc_id,
        productName,
        batchNo: batchNoKey,
      });
    } catch (e) {
      console.error(`[country-stock PUT] recompute error for ${key}:`, e.message);
    }
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: list country stock ────────────────────────────────────────────────
  // IMPORTANT: inventory_balances is NOT used here.  It accumulates one row
  // per period per product per location, so SUM(closing_qty) inflates figures
  // by the number of historical periods stored and can show non-zero values
  // even when stock_batches.remaining_quantity is 0.
  // All quantities come directly from the live physical tables:
  //   country_stock / warehouses → stock_batches.remaining_quantity
  //   branches                   → branch_inventory_batches.quantity
  if (req.method === 'GET') {
    try {
      const [countryRows, warehouseRows, branchRows, priceRows] = await Promise.all([
        // Live country stock from stock_batches
        getMany(
          `SELECT sb.description AS product_name, sb.batch_no, sb.expiry_date,
                  sb.remaining_quantity AS closing_qty,
                  sb.quantity          AS inward_qty,
                  (sb.quantity - sb.remaining_quantity) AS outward_qty,
                  COALESCE(p.dp, sb.dpc_unit_value, sb.unit_price, 0) AS unit_dp,
                  sb.remaining_quantity * COALESCE(p.dp, sb.dpc_unit_value, sb.unit_price, 0) AS stock_value_dp,
                  sb.import_date AS last_movement_date
           FROM stock_batches sb
           LEFT JOIN product_prices p
                  ON LOWER(TRIM(p.description)) = LOWER(TRIM(sb.description))
           WHERE sb.location = 'country_stock'
             AND sb.remaining_quantity > 0
             AND COALESCE(sb.status, '') != 'expired'
           ORDER BY sb.description ASC, sb.expiry_date ASC NULLS LAST`
        ),
        // Live warehouse quantities
        getMany(
          `SELECT sb.location, sb.description AS product_name,
                  SUM(sb.remaining_quantity) AS qty,
                  COALESCE(MAX(p.dp), MAX(sb.dpc_unit_value), 0) AS unit_dp,
                  SUM(sb.remaining_quantity * COALESCE(p.dp, sb.dpc_unit_value, 0)) AS stock_value_dp
           FROM stock_batches sb
           LEFT JOIN product_prices p
                  ON LOWER(TRIM(p.description)) = LOWER(TRIM(sb.description))
           WHERE sb.location != 'country_stock'
             AND sb.remaining_quantity > 0
             AND COALESCE(sb.status, '') != 'expired'
           GROUP BY sb.location, sb.description`
        ),
        // Live branch quantities
        getMany(
          `SELECT b.branch_id, b.product_name,
                  SUM(b.quantity) AS qty,
                  COALESCE(MAX(p.dp), 0) AS unit_dp,
                  SUM(b.quantity * COALESCE(p.dp, 0)) AS stock_value_dp
           FROM branch_inventory_batches b
           LEFT JOIN product_prices p
                  ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
           WHERE b.quantity > 0
           GROUP BY b.branch_id, b.product_name`
        ),
        getMany(`SELECT description, dp FROM product_prices`),
      ]);

      const distinctProducts = new Set(countryRows.map(r => r.product_name)).size;
      const totalUnits    = countryRows.reduce((s, r) => s + Number(r.closing_qty || 0), 0);
      const stockValueDP  = countryRows.reduce((s, r) => s + Number(r.stock_value_dp || 0), 0);
      const lowStockItems = countryRows.filter(r => Number(r.closing_qty || 0) < 10).length;

      const items = countryRows.map(r => ({
        productName:      r.product_name,
        batchNo:          r.batch_no || '',
        expiryDate:       r.expiry_date,
        closingQty:       Number(r.closing_qty || 0),
        inwardQty:        Number(r.inward_qty || 0),
        outwardQty:       Number(r.outward_qty || 0),
        unitDP:           Number(r.unit_dp || 0),
        stockValueDP:     Number(r.stock_value_dp || 0),
        lastMovementDate: r.last_movement_date,
      }));

      // Build locationBreakdown from live physical tables only
      const locationBreakdown = {};
      const upsertLoc = (locationType, locationId, productName, qty, unitDP, valueDP) => {
        const key = `${locationType}||${locationId}`;
        if (!locationBreakdown[key]) locationBreakdown[key] = { locationType, locationId, products: [], totalUnits: 0 };
        locationBreakdown[key].products.push({ productName, batchNo: '', closingQty: Number(qty), unitDP: Number(unitDP), stockValueDP: Number(valueDP) });
        locationBreakdown[key].totalUnits += Number(qty);
      };
      for (const r of countryRows)   upsertLoc('country',   'country_stock',  r.product_name, r.closing_qty, r.unit_dp, r.stock_value_dp);
      for (const r of warehouseRows) upsertLoc('warehouse',  r.location,       r.product_name, r.qty,         r.unit_dp, r.stock_value_dp);
      for (const r of branchRows)    upsertLoc('branch',     r.branch_id,      r.product_name, r.qty,         r.unit_dp, r.stock_value_dp);

      const locationBreakdownList = Object.values(locationBreakdown).sort((a, b) => {
        const order = { country: 0, warehouse: 1, branch: 2 };
        if (order[a.locationType] !== order[b.locationType]) return order[a.locationType] - order[b.locationType];
        return a.locationId.localeCompare(b.locationId);
      });

      return res.status(200).json({
        success: true,
        summary: { distinctProducts, totalUnits, stockValueDP: parseFloat(stockValueDP.toFixed(2)), lowStockItems },
        items,
        locationBreakdown: locationBreakdownList,
      });
    } catch (err) {
      console.error('Country stock GET error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  // ── PUT: admin direct edit of a country stock batch ────────────────────────
  if (req.method === 'PUT') {
    try {
      const { user } = req;
      const role = (user?.role || '').toLowerCase();
      if (!['admin', 'superadmin', 'super_admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      const { productName, batchNo, remainingQty, expiryDate, newBatchNo, unitDp, notes, reason } = req.body;

      if (!productName) return res.status(400).json({ success: false, error: 'productName is required' });
      if (!reason || !reason.trim()) return res.status(400).json({ success: false, error: 'reason is required' });

      const batchNoKey = batchNo || '';
      const actor = user?.full_name || user?.username || 'admin';
      const auditNote = `Admin edit by ${actor}: ${reason.trim()}`;

      // ── 1. Find the stock_batches record (uses 'description' for product name)
      const batch = await getOne(
        `SELECT id, remaining_quantity, expiry_date, batch_no, dpc_unit_value, notes
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2
         ORDER BY expiry_date ASC NULLS LAST
         LIMIT 1`,
        [productName, batchNoKey]
      );

      if (!batch) {
        return res.status(404).json({ success: false, error: `No country_stock batch found for ${productName} / ${batchNo || 'no batch'}` });
      }

      // ── 2. Get current closing_qty from inventory_balances (source of truth for balance)
      const currentBalance = await getOne(
        `SELECT closing_qty FROM inventory_balances
         WHERE location_type = 'country'
           AND location_id = 'country_stock'
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2
         LIMIT 1`,
        [productName, batchNoKey]
      );
      const currentQty = Number(currentBalance?.closing_qty ?? batch.remaining_quantity ?? 0);

      // ── 3. Quantity correction: insert a corrective stock_movement so the
      //       recompute (which reads stock_movements) arrives at the new qty.
      if (remainingQty !== undefined && remainingQty !== null && remainingQty !== '') {
        const newQty = Number(remainingQty);
        if (isNaN(newQty) || newQty < 0) {
          return res.status(400).json({ success: false, error: 'remainingQty must be a non-negative number' });
        }
        const delta = newQty - currentQty;
        if (delta !== 0) {
          const movType   = delta > 0 ? 'positive_adjustment' : 'negative_adjustment';
          const srcLoc    = delta < 0 ? 'country_stock' : null;
          const srcType   = delta < 0 ? 'country'       : null;
          const dstLoc    = delta > 0 ? 'country_stock' : null;
          const dstType   = delta > 0 ? 'country'       : null;
          await query(
            `INSERT INTO stock_movements
               (id, movement_type,
                source_location, source_location_type,
                destination_location, destination_location_type,
                product_name, batch_no, expiry_date, quantity,
                unit_dp, notes, status, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'posted', NOW(), NOW())`,
            [
              movType,
              srcLoc, srcType,
              dstLoc, dstType,
              productName, batchNo || null,
              batch.expiry_date || null,
              Math.abs(delta),
              Number(unitDp ?? batch.dpc_unit_value ?? 0) || null,
              auditNote,
            ]
          );
        }
      }

      // ── 4. Unit DP change: update ALL stock_movements for this batch across every location
      //       (warehouse→branch transfers don't reference country_stock but carry the same price)
      if (unitDp !== undefined && unitDp !== null && unitDp !== '') {
        const dp = Number(unitDp);
        if (isNaN(dp) || dp < 0) {
          return res.status(400).json({ success: false, error: 'unitDp must be a non-negative number' });
        }
        await query(
          `UPDATE stock_movements
           SET unit_dp = $1, updated_at = NOW()
           WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [dp, productName, batchNoKey]
        );
        // Also update all stock_batches rows for this product+batch across all locations
        await query(
          `UPDATE stock_batches
           SET dpc_unit_value = $1, updated_at = NOW()
           WHERE LOWER(TRIM(description)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [dp, productName, batchNoKey]
        );
      }

      // ── 5. Expiry date change: propagate to ALL stock_movements + ALL stock_batches for this
      //       product+batch across every location (expiry is a property of the batch, not location)
      if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '') {
        await query(
          `UPDATE stock_movements SET expiry_date = $1, updated_at = NOW()
           WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [expiryDate, productName, batchNoKey]
        );
        await query(
          `UPDATE stock_batches SET expiry_date = $1, updated_at = NOW()
           WHERE LOWER(TRIM(description)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [expiryDate, productName, batchNoKey]
        );
      }

      // ── 6. Batch number rename: propagate to ALL stock_movements + ALL stock_batches
      const effectiveBatchNo = (newBatchNo !== undefined && newBatchNo !== null && newBatchNo !== '' && newBatchNo !== batchNo)
        ? newBatchNo.trim() : null;
      if (effectiveBatchNo) {
        await query(
          `UPDATE stock_movements SET batch_no = $1, updated_at = NOW()
           WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [effectiveBatchNo, productName, batchNoKey]
        );
        await query(
          `UPDATE stock_batches SET batch_no = $1, updated_at = NOW()
           WHERE LOWER(TRIM(description)) = LOWER(TRIM($2))
             AND COALESCE(batch_no, '') = $3`,
          [effectiveBatchNo, productName, batchNoKey]
        );
      }

      // ── 7. Update the country_stock batch remaining_quantity + notes (location-specific fields)
      //       unit_dp / expiry_date / batch_no already propagated system-wide above
      const batchSets = ['updated_at = NOW()'];
      const batchParams = [];
      let bp = 1;
      if (remainingQty !== undefined && remainingQty !== null && remainingQty !== '') {
        batchSets.push(`remaining_quantity = $${bp++}`); batchParams.push(Number(remainingQty));
      }
      if (notes !== undefined && notes !== null) {
        batchSets.push(`notes = $${bp++}`); batchParams.push(notes);
      }
      batchParams.push(batch.id);
      await query(`UPDATE stock_batches SET ${batchSets.join(', ')} WHERE id = $${bp}`, batchParams);

      // ── 8. Recompute inventory_balances for EVERY location that has ever handled this batch
      //       (not just country_stock — warehouse and branch balances must reflect price / expiry changes)
      const finalBatchKey = effectiveBatchNo || batchNoKey;
      await recomputeAllLocationsForBatch(productName, finalBatchKey);

      // ── 9. Notify realtime subscribers (InventoryTab, RealtimeTab, FieldStockTab, etc.)
      publishRealtimeEvent('inventory_balances', 'update', {
        productName,
        batchNo: finalBatchKey,
        source: 'admin_country_stock_edit',
      }).catch(() => {});

      return res.status(200).json({ success: true, message: 'Batch updated successfully' });
    } catch (err) {
      console.error('Country stock PUT error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  // ── DELETE: wipe all country stock batches + supplier imports ──────────────
  if (req.method === 'DELETE') {
    try {
      const { user } = req;
      const role = (user?.role || '').toLowerCase();
      if (!['admin', 'superadmin', 'super_admin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }

      // 1. Remove barcode events for country stock batches (FK dependency)
      await query(
        `DELETE FROM barcode_batch_events
         WHERE batch_id IN (
           SELECT id FROM stock_batches WHERE location = 'country_stock'
         )`
      );

      // 2. Delete all country stock batches
      const batchResult = await query(
        `DELETE FROM stock_batches WHERE location = 'country_stock' RETURNING id`
      );

      // 3. Delete all supplier import records
      const importResult = await query(`DELETE FROM supplier_imports RETURNING id`);

      // 4. Delete inventory_balances rows for country location
      await query(`DELETE FROM inventory_balances WHERE location_type = 'country'`);

      publishRealtimeEvent('inventory_balances', 'delete', {
        source: 'admin_clear_country_stock',
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: `Cleared ${batchResult.rowCount} country stock batch(es) and ${importResult.rowCount} import record(s).`,
        batchesDeleted: batchResult.rowCount,
        importsDeleted: importResult.rowCount,
      });
    } catch (err) {
      console.error('Country stock DELETE error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
