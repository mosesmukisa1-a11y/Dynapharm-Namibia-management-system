/**
 * POST /api/stock/country-stock/release
 * Release stock from Country Stock staging area to a named warehouse.
 *
 * Two stock movements per item:
 *   1. transfer_out  from country_stock  → decrements country stock balance
 *   2. warehouse_receipt  to warehouseId → increments warehouse balance
 *
 * Design:
 * - All movement inserts + stock_batches updates run inside a single DB transaction
 *   via withTransaction(). Any failure rolls back all DB writes cleanly.
 * - inventory_balances recompute is deferred until AFTER the transaction commits,
 *   so the pool reads the now-committed movement rows correctly.
 * - stock_batches rows are depleted FIFO (oldest import_date first) with row-level locking.
 * - Duplicate (product, batch) lines are aggregated before validation and processing.
 */
import { applyAuthCors } from '../../_lib/auth.js';
import { getOne, withTransaction, publishRealtimeEvent } from '../../db.js';
import { postStockMovementTx, recomputeInventoryBalance } from '../../services/stockEngine.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

const VALID_WAREHOUSES = ['windhoek_warehouse', 'ondangwa_warehouse'];

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await parseBody(req);
  const { warehouseId, items, releasedBy, notes } = body;

  if (!warehouseId) {
    return res.status(400).json({ success: false, error: 'warehouseId is required' });
  }
  if (!VALID_WAREHOUSES.includes(warehouseId)) {
    return res.status(400).json({ success: false, error: `warehouseId must be one of: ${VALID_WAREHOUSES.join(', ')}` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });
  }

  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productName && !item.product_name) {
      validationErrors.push(`Item ${i + 1}: productName is required`);
    }
    if (!item.batchNo && !item.batch_no) {
      validationErrors.push(`Item ${i + 1} (${item.productName || 'unknown'}): batchNo is required`);
    }
    if (!item.quantity || Number(item.quantity) <= 0) {
      validationErrors.push(`Item ${i + 1}: quantity must be > 0`);
    }
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({ success: false, error: 'Validation failed', validationErrors });
  }

  const aggregated = new Map();
  for (const item of items) {
    const productName = item.productName || item.product_name;
    const batchNo = item.batchNo || item.batch_no || '';
    const key = `${productName.toLowerCase().trim()}||${batchNo}`;
    if (!aggregated.has(key)) {
      aggregated.set(key, {
        productName, batchNo,
        expiryDate: item.expiryDate || item.expiry_date || null,
        quantity: 0,
        unitDP: Number(item.unitDP || item.unit_dp || 0) || undefined,
      });
    }
    aggregated.get(key).quantity += Number(item.quantity);
  }

  // Check stock availability against stock_batches.remaining_quantity (the authoritative physical stock record).
  // inventory_balances is a movement-derived cache and may not reflect stock imported directly via the
  // warehouse portal (no corresponding inward movement). Falling back to inventory_balances as secondary
  // only when no stock_batches rows exist for this product+batch.
  const stockErrors = [];
  for (const [, agg] of aggregated) {
    const batchAvail = await getOne(
      `SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
       FROM stock_batches
       WHERE location = 'country_stock'
         AND LOWER(TRIM(description)) = LOWER(TRIM($1))
         AND COALESCE(batch_no, '') = $2
         AND status != 'expired'`,
      [agg.productName, agg.batchNo]
    );
    let available = Number(batchAvail?.qty ?? 0);

    // Secondary fallback: if no stock_batches rows found, check inventory_balances
    if (available <= 0) {
      const ibBalance = await getOne(
        `SELECT COALESCE(closing_qty, 0) AS qty
         FROM inventory_balances
         WHERE location_type = 'country'
           AND location_id = 'country_stock'
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2`,
        [agg.productName, agg.batchNo]
      );
      available = Number(ibBalance?.qty ?? 0);
    }

    if (available < agg.quantity) {
      stockErrors.push(
        `${agg.productName} batch ${agg.batchNo || 'N/A'}: requested ${agg.quantity}, available at country stock: ${available}`
      );
    }
  }
  if (stockErrors.length > 0) {
    return res.status(409).json({ success: false, error: 'Insufficient country stock', stockErrors });
  }

  const ts = Date.now();
  const refId = `REL-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const releaseNote = notes || `Released from Country Stock to ${warehouseId}`;
  const released = [];
  const allRecomputeTargets = [];

  await withTransaction(async (client) => {
    for (const [, agg] of aggregated) {
      const { productName, batchNo, quantity, unitDP } = agg;
      let { expiryDate } = agg;

      // Look up the source batch for expiry, DP value, CIF value, and supplier linkage
      const sourceBatchLookup = await client.query(
        `SELECT expiry_date, dpc_unit_value, cif_unit_cost, supplier_import_id, import_reference
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2
           AND remaining_quantity > 0
         ORDER BY import_date ASC, created_at ASC
         LIMIT 1`,
        [productName, batchNo]
      );
      const srcBatchMeta = sourceBatchLookup.rows[0] || {};
      if (!expiryDate && srcBatchMeta.expiry_date) {
        expiryDate = srcBatchMeta.expiry_date;
      }
      // Use caller-supplied unitDP if provided, otherwise read from batch
      const resolvedUnitDP = unitDP || Number(srcBatchMeta.dpc_unit_value || 0) || undefined;
      const resolvedUnitCIF = Number(srcBatchMeta.cif_unit_cost || 0) || undefined;

      const commonFields = {
        productName, batchNo, expiryDate, quantity,
        referenceId: refId,
        notes: releaseNote,
        unitDP: resolvedUnitDP,
        unitCIF: resolvedUnitCIF,
        createdBy: releasedBy || 'system',
      };

      const out = await postStockMovementTx(client, {
        ...commonFields,
        movementType: 'transfer_out',
        sourceLocation: 'country_stock',
        sourceLocationType: 'country',
        destinationLocation: warehouseId,
        destinationLocationType: 'warehouse',
      });
      allRecomputeTargets.push(...out.recomputeTargets);

      const recv = await postStockMovementTx(client, {
        ...commonFields,
        movementType: 'warehouse_receipt',
        sourceLocation: 'country_stock',
        sourceLocationType: 'country',
        destinationLocation: warehouseId,
        destinationLocationType: 'warehouse',
      });
      allRecomputeTargets.push(...recv.recomputeTargets);

      const batchRows = await client.query(
        `SELECT id, remaining_quantity
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2
           AND remaining_quantity > 0
         ORDER BY import_date ASC, created_at ASC
         FOR UPDATE`,
        [productName, batchNo]
      );

      let remaining = quantity;
      for (const row of batchRows.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(row.remaining_quantity));
        await client.query(
          `UPDATE stock_batches
           SET remaining_quantity = remaining_quantity - $1,
               dispatched_quantity = COALESCE(dispatched_quantity, 0) + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [take, row.id]
        );
        remaining -= take;
      }

      if (remaining > 0) {
        throw new Error(
          `Insufficient stock_batches rows for ${productName} batch ${batchNo || 'N/A'} at country_stock (shortfall: ${remaining})`
        );
      }

      const sourceBatchResult = await client.query(
        `SELECT description, batch_no, expiry_date, import_date, product_id,
                supplier_name, import_reference, supplier_import_id,
                dpc_unit_value, cif_unit_cost
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2
         LIMIT 1`,
        [productName, batchNo]
      );

      if (sourceBatchResult.rows.length > 0) {
        const sb = sourceBatchResult.rows[0];
        const newBatchId = `BATCH-REL-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        const newBarcode = `BC-REL-${(batchNo || 'NB')}-${Date.now().toString(36).toUpperCase()}`;
        await client.query(
          `INSERT INTO stock_batches
             (id, barcode, description, batch_no, expiry_date, quantity, remaining_quantity,
              dispatched_quantity, import_date, location, status, product_id, warehouse_id,
              supplier_name, import_reference, supplier_import_id,
              dpc_unit_value, cif_unit_cost,
              metadata, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$6, 0,$7,$8,'available',$9,$8,$10,$11,$12,$13,$14,
             jsonb_build_object('released_from','country_stock','release_ref',$15::text),
             NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            newBatchId, newBarcode,
            sb.description, sb.batch_no, sb.expiry_date,
            quantity,
            sb.import_date, warehouseId,
            sb.product_id, sb.supplier_name, sb.import_reference,
            sb.supplier_import_id || null,
            sb.dpc_unit_value || null, sb.cif_unit_cost || null,
            refId,
          ]
        );
      }

      released.push({ productName, batchNo, expiryDate, quantity });
    }
  });

  const uniqueTargets = [];
  const seen = new Set();
  for (const t of allRecomputeTargets) {
    const key = `${t.locationType}||${t.locationId}||${t.productName.toLowerCase().trim()}||${t.batchNo || ''}`;
    if (!seen.has(key)) { seen.add(key); uniqueTargets.push(t); }
  }
  await Promise.allSettled(uniqueTargets.map(t => recomputeInventoryBalance(t)));

  for (const item of released) {
    publishRealtimeEvent('stock', 'movement', {
      movementType: 'country_stock_release',
      productName: item.productName,
      quantity: item.quantity,
      sourceLocation: 'country_stock',
      destinationLocation: warehouseId,
      referenceId: refId,
    }).catch(() => {});
  }

  return res.status(201).json({
    success: true,
    referenceId: refId,
    warehouseId,
    itemsReleased: released.length,
    items: released,
    message: `${released.length} item(s) released from Country Stock to ${warehouseId}`,
  });
}
