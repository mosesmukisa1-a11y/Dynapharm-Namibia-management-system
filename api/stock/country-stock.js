import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';
import { recomputeInventoryBalance, recomputeLocationBalances, inferLocationType } from '../services/stockEngine.js';
import { publishRealtimeEvent } from '../db.js';
import { getStockAlertPolicy } from '../services/stockAlertPolicy.js';

/**
 * Recompute inventory_balances for every location that has ever had
 * a stock_movement for the given product+batch combination.
 */
async function recomputeAllLocationsForBatch(productName, batchNoKey) {
  const result = await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:13:0"),













  [productName, batchNoKey]);


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
        batchNo: batchNoKey
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
      __qd_executePlan(getMany, __qd_registeredPlan("api/stock/country-stock.js:66:1"), []),















      // Live warehouse quantities
      __qd_executePlan(getMany, __qd_registeredPlan("api/stock/country-stock.js:83:2"), []),












      // Live branch quantities
      __qd_executePlan(getMany, __qd_registeredPlan("api/stock/country-stock.js:97:3"), []), __qd_executePlan(










        getMany, __qd_registeredPlan("api/stock/country-stock.js:107:4"), [])]
      );

      const distinctProducts = new Set(countryRows.map((r) => r.product_name)).size;
      const totalUnits = countryRows.reduce((s, r) => s + Number(r.closing_qty || 0), 0);
      const stockValueDP = countryRows.reduce((s, r) => s + Number(r.stock_value_dp || 0), 0);
      const alertPolicy = await getStockAlertPolicy();
      const lowStockItems = countryRows.filter((r) => Number(r.closing_qty || 0) < alertPolicy.lowStockThreshold).length;

      const items = countryRows.map((r) => ({
        productName: r.product_name,
        batchNo: r.batch_no || '',
        expiryDate: r.expiry_date,
        closingQty: Number(r.closing_qty || 0),
        inwardQty: Number(r.inward_qty || 0),
        outwardQty: Number(r.outward_qty || 0),
        unitDP: Number(r.unit_dp || 0),
        stockValueDP: Number(r.stock_value_dp || 0),
        lastMovementDate: r.last_movement_date
      }));

      // Build locationBreakdown from live physical tables only
      const locationBreakdown = {};
      const upsertLoc = (locationType, locationId, productName, qty, unitDP, valueDP) => {
        const key = `${locationType}||${locationId}`;
        if (!locationBreakdown[key]) locationBreakdown[key] = { locationType, locationId, products: [], totalUnits: 0 };
        locationBreakdown[key].products.push({ productName, batchNo: '', closingQty: Number(qty), unitDP: Number(unitDP), stockValueDP: Number(valueDP) });
        locationBreakdown[key].totalUnits += Number(qty);
      };
      for (const r of countryRows) upsertLoc('country', 'country_stock', r.product_name, r.closing_qty, r.unit_dp, r.stock_value_dp);
      for (const r of warehouseRows) upsertLoc('warehouse', r.location, r.product_name, r.qty, r.unit_dp, r.stock_value_dp);
      for (const r of branchRows) upsertLoc('branch', r.branch_id, r.product_name, r.qty, r.unit_dp, r.stock_value_dp);

      const locationBreakdownList = Object.values(locationBreakdown).sort((a, b) => {
        const order = { country: 0, warehouse: 1, branch: 2 };
        if (order[a.locationType] !== order[b.locationType]) return order[a.locationType] - order[b.locationType];
        return a.locationId.localeCompare(b.locationId);
      });

      return res.status(200).json({
        success: true,
        summary: { distinctProducts, totalUnits, stockValueDP: parseFloat(stockValueDP.toFixed(2)), lowStockItems },
        items,
        locationBreakdown: locationBreakdownList
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
      const batch = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/country-stock.js:179:5"),







      [productName, batchNoKey]);


      if (!batch) {
        return res.status(404).json({ success: false, error: `No country_stock batch found for ${productName} / ${batchNo || 'no batch'}` });
      }

      // ── 2. Get current closing_qty from inventory_balances (source of truth for balance)
      const currentBalance = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/country-stock.js:195:6"),






      [productName, batchNoKey]);

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
          const movType = delta > 0 ? 'positive_adjustment' : 'negative_adjustment';
          const srcLoc = delta < 0 ? 'country_stock' : null;
          const srcType = delta < 0 ? 'country' : null;
          const dstLoc = delta > 0 ? 'country_stock' : null;
          const dstType = delta > 0 ? 'country' : null;
          await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:220:7"),







          [
          movType,
          srcLoc, srcType,
          dstLoc, dstType,
          productName, batchNo || null,
          batch.expiry_date || null,
          Math.abs(delta),
          Number(unitDp ?? batch.dpc_unit_value ?? 0) || null,
          auditNote]);


        }
      }

      // ── 4. Unit DP change: update ALL stock_movements for this batch across every location
      //       (warehouse→branch transfers don't reference country_stock but carry the same price)
      if (unitDp !== undefined && unitDp !== null && unitDp !== '') {
        const dp = Number(unitDp);
        if (isNaN(dp) || dp < 0) {
          return res.status(400).json({ success: false, error: 'unitDp must be a non-negative number' });
        }
        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:249:8"),




        [dp, productName, batchNoKey]);

        // Also update all stock_batches rows for this product+batch across all locations
        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:257:9"),




        [dp, productName, batchNoKey]);

      }

      // ── 5. Expiry date change: propagate to ALL stock_movements + ALL stock_batches for this
      //       product+batch across every location (expiry is a property of the batch, not location)
      if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '') {
        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:269:10"),



        [expiryDate, productName, batchNoKey]);

        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:275:11"),



        [expiryDate, productName, batchNoKey]);

      }

      // ── 6. Batch number rename: propagate to ALL stock_movements + ALL stock_batches
      const effectiveBatchNo = newBatchNo !== undefined && newBatchNo !== null && newBatchNo !== '' && newBatchNo !== batchNo ?
      newBatchNo.trim() : null;
      if (effectiveBatchNo) {
        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:287:12"),



        [effectiveBatchNo, productName, batchNoKey]);

        await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:293:13"),



        [effectiveBatchNo, productName, batchNoKey]);

      }

      // ── 7. Update the country_stock batch remaining_quantity + notes (location-specific fields)
      //       unit_dp / expiry_date / batch_no already propagated system-wide above
      const batchSets = [__qd_registeredPlan("api/stock/country-stock.js:302:14")];
      const batchParams = [];
      let bp = 1;
      if (remainingQty !== undefined && remainingQty !== null && remainingQty !== '') {
        batchSets.push(__qd_registeredPlan("api/stock/country-stock.js:306:15", [bp++]));batchParams.push(Number(remainingQty));
      }
      if (notes !== undefined && notes !== null) {
        batchSets.push(__qd_registeredPlan("api/stock/country-stock.js:309:16", [bp++]));batchParams.push(notes);
      }
      batchParams.push(batch.id);
      await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:312:17", [__qd_joinPlans(batchSets, "comma"), bp]), batchParams);

      // ── 8. Recompute inventory_balances for EVERY location that has ever handled this batch
      //       (not just country_stock — warehouse and branch balances must reflect price / expiry changes)
      const finalBatchKey = effectiveBatchNo || batchNoKey;
      await recomputeAllLocationsForBatch(productName, finalBatchKey);

      // ── 9. Notify realtime subscribers (InventoryTab, RealtimeTab, FieldStockTab, etc.)
      publishRealtimeEvent('inventory_balances', 'update', {
        productName,
        batchNo: finalBatchKey,
        source: 'admin_country_stock_edit'
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
      await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:345:18"), []);






      // 2. Delete all country stock batches
      const batchResult = await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:353:19"), []);



      // 3. Delete all supplier import records
      const importResult = await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:357:20"), []);

      // 4. Delete inventory_balances rows for country location
      await __qd_executePlan(query, __qd_registeredPlan("api/stock/country-stock.js:360:21"), []);

      publishRealtimeEvent('inventory_balances', 'delete', {
        source: 'admin_clear_country_stock'
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: `Cleared ${batchResult.rowCount} country stock batch(es) and ${importResult.rowCount} import record(s).`,
        batchesDeleted: batchResult.rowCount,
        importsDeleted: importResult.rowCount
      });
    } catch (err) {
      console.error('Country stock DELETE error:', err);
      if (!res.headersSent) return res.status(500).json({ success: false, error: err.message });
    }
    return;
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
