/**
 * POST /api/stock/country-stock/release
 * Submit a warehouse dispatch for GM approval.
 *
 * Flow:
 *   1. Validate warehouseId + items
 *   2. Check country stock availability (stock_batches.remaining_quantity)
 *   3. Create stock_transfers record with status='pending_approval'
 *   4. Create stock_transfer_items for each line
 *   5. Return transfer details — NO stock movement yet
 *
 * Stock only moves when the warehouse accepts via POST /api/stock/warehouses/receive-stock
 */
import { applyAuthCors } from '../../_lib/auth.js';
import { getOne, getMany, withTransaction, publishRealtimeEvent } from '../../db.js';

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

  if (!warehouseId || !VALID_WAREHOUSES.includes(warehouseId)) {
    return res.status(400).json({ success: false, error: `warehouseId must be one of: ${VALID_WAREHOUSES.join(', ')}` });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });
  }

  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productName && !item.product_name) validationErrors.push(`Item ${i + 1}: productName is required`);
    if (!item.quantity || Number(item.quantity) <= 0) validationErrors.push(`Item ${i + 1}: quantity must be > 0`);
  }
  if (validationErrors.length > 0) return res.status(422).json({ success: false, error: 'Validation failed', validationErrors });

  // Aggregate duplicate product+batch lines
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
      });
    }
    aggregated.get(key).quantity += Number(item.quantity);
  }

  // Validate country stock availability
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
    const available = Number(batchAvail?.qty ?? 0);
    if (available < agg.quantity) {
      stockErrors.push(`${agg.productName} batch ${agg.batchNo || 'N/A'}: requested ${agg.quantity}, available: ${available}`);
    }
  }
  if (stockErrors.length > 0) {
    return res.status(409).json({ success: false, error: 'Insufficient country stock', stockErrors });
  }

  const ts = Date.now();
  const transferId = `WD-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const dispatchRef = `WDREF-${ts}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const createdBy = releasedBy || req.user?.fullName || req.user?.username || 'system';

  await withTransaction(async (client) => {
    // Create the transfer record (pending_approval — no stock movement yet)
    await client.query(
      `INSERT INTO stock_transfers
         (id, from_warehouse, to_branch, status,
          dispatch_reference, dispatch_notes,
          dispatched_by, created_by,
          metadata, created_at, updated_at)
       VALUES ($1::varchar, 'country_stock', $2::varchar, 'pending_approval',
               $3::varchar, $4::text,
               $5::varchar, $5::varchar,
               jsonb_build_object('dispatch_type','warehouse_dispatch','source','country_stock'),
               NOW(), NOW())`,
      [transferId, warehouseId, dispatchRef, notes || null, createdBy]
    );

    // Create transfer items in stock_transfer_items
    for (const [, agg] of aggregated) {
      // Look up expiry if not provided
      let expiryDate = agg.expiryDate;
      if (!expiryDate) {
        const row = await client.query(
          `SELECT expiry_date FROM stock_batches
           WHERE location = 'country_stock'
             AND LOWER(TRIM(description)) = LOWER(TRIM($1))
             AND COALESCE(batch_no,'') = $2
             AND remaining_quantity > 0
           ORDER BY expiry_date ASC NULLS LAST LIMIT 1`,
          [agg.productName, agg.batchNo]
        );
        expiryDate = row.rows[0]?.expiry_date || null;
      }
      await client.query(
        `INSERT INTO stock_transfer_items
           (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, unit)
         VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5, $6::numeric, 'units')`,
        [transferId, agg.productName, agg.productName, agg.batchNo || null, expiryDate, agg.quantity]
      );
    }
  });

  publishRealtimeEvent('stock_transfers', 'create', { id: transferId, from_warehouse: 'country_stock', to_branch: warehouseId, status: 'pending_approval' }).catch(() => {});

  return res.status(201).json({
    success: true,
    transferId,
    referenceId: dispatchRef,
    warehouseId,
    status: 'pending_approval',
    itemCount: aggregated.size,
    message: `Warehouse dispatch submitted for GM approval (${aggregated.size} product line(s)). Stock remains in Country Stock until the warehouse confirms receipt after GM approval.`,
  });
}
