/**
 * POST /api/stock/warehouses/receive-stock
 * Warehouse accepts a GM-approved dispatch from Country Stock.
 *
 * Body: { transferId, receivedBy, rejectionReason? }
 * Action 'accept': FIFO deducts country_stock → creates warehouse stock_batches → marks transfer received
 * Action 'reject': Sets transfer to 'rejected' with reason, no stock movement
 */
import { applyAuthCors } from '../../_lib/auth.js';
import { getOne, getMany, withTransaction, publishRealtimeEvent } from '../../db.js';
import { broadcastStockEvent } from '../../services/stockEvents.js';
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

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await parseBody(req);
  const { transferId, action, receivedBy, rejectionReason } = body;

  if (!transferId) return res.status(400).json({ success: false, error: 'transferId is required' });
  if (!action || !['accept', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be "accept" or "reject"' });

  // Load the transfer
  const transfer = await getOne(
    `SELECT id, from_warehouse, to_branch, status, gm_approved_by, dispatch_reference
     FROM stock_transfers WHERE id = $1`,
    [transferId]
  );
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });
  if (transfer.from_warehouse !== 'country_stock') return res.status(400).json({ success: false, error: 'This endpoint only handles Country Stock dispatches' });

  const WAREHOUSE_IDS = ['windhoek_warehouse', 'ondangwa_warehouse'];
  if (!WAREHOUSE_IDS.includes(transfer.to_branch)) return res.status(400).json({ success: false, error: 'Invalid warehouse destination' });

  // REJECT flow — no stock movement needed
  if (action === 'reject') {
    if (!['approved', 'pending_approval'].includes(transfer.status)) {
      return res.status(409).json({ success: false, error: `Cannot reject a transfer with status '${transfer.status}'` });
    }
    await getOne(
      `UPDATE stock_transfers
       SET status = 'rejected',
           dispatch_notes = COALESCE($1, dispatch_notes),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [rejectionReason || null, transferId]
    );
    publishRealtimeEvent('stock_transfers', 'update', { id: transferId, status: 'rejected' }).catch(() => {});
    broadcastStockEvent('transfer_rejected', { transferId });
    return res.json({ success: true, action: 'rejected', transferId, message: 'Dispatch rejected — stock remains in Country Stock.' });
  }

  // ACCEPT flow — must be GM-approved first
  if (transfer.status !== 'approved') {
    return res.status(409).json({
      success: false,
      error: `Cannot accept: transfer status is '${transfer.status}'. GM must approve first.`,
    });
  }

  // Load items
  const itemRows = await getMany(
    `SELECT product_name, batch_no, expiry_date, quantity
     FROM stock_transfer_items WHERE transfer_id = $1`,
    [transferId]
  );
  if (itemRows.length === 0) return res.status(400).json({ success: false, error: 'Transfer has no items' });

  const warehouseId = transfer.to_branch;
  const actor = receivedBy || req.user?.fullName || req.user?.username || 'warehouse';
  const allRecomputeTargets = [];

  try {
  await withTransaction(async (client) => {
    for (const item of itemRows) {
      const { product_name: productName, batch_no: batchNo, quantity } = item;
      const qty = Number(quantity);

      // Resolve expiry from stock_batches if not stored on item
      let expiryDate = item.expiry_date;
      if (!expiryDate) {
        const eBatch = await client.query(
          `SELECT expiry_date FROM stock_batches
           WHERE location = 'country_stock'
             AND LOWER(TRIM(description)) = LOWER(TRIM($1))
             AND COALESCE(batch_no,'') = COALESCE($2,'')
             AND remaining_quantity > 0
           ORDER BY expiry_date ASC NULLS LAST LIMIT 1`,
          [productName, batchNo || null]
        );
        expiryDate = eBatch.rows[0]?.expiry_date || null;
      }

      // Look up source batch metadata (supplier, DP value, CIF, import_date)
      const srcBatch = await client.query(
        `SELECT import_date, supplier_name, import_reference, supplier_import_id,
                dpc_unit_value, cif_unit_cost, product_id
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no,'') = COALESCE($2,'')
           AND remaining_quantity > 0
         ORDER BY import_date ASC, created_at ASC LIMIT 1`,
        [productName, batchNo || null]
      );
      const sb = srcBatch.rows[0] || {};

      const commonFields = {
        productName, batchNo: batchNo || '', expiryDate, quantity: qty,
        referenceId: transfer.dispatch_reference || transferId,
        notes: `Warehouse receipt from Country Stock — dispatch ${transferId}`,
        unitDP: sb.dpc_unit_value ? Number(sb.dpc_unit_value) : undefined,
        unitCIF: sb.cif_unit_cost ? Number(sb.cif_unit_cost) : undefined,
        createdBy: actor,
      };

      // 1. stock_movement: transfer_out from country_stock
      const out = await postStockMovementTx(client, {
        ...commonFields,
        movementType: 'transfer_out',
        sourceLocation: 'country_stock',
        sourceLocationType: 'country',
        destinationLocation: warehouseId,
        destinationLocationType: 'warehouse',
      });
      allRecomputeTargets.push(...out.recomputeTargets);

      // 2. stock_movement: warehouse_receipt into warehouse
      const recv = await postStockMovementTx(client, {
        ...commonFields,
        movementType: 'warehouse_receipt',
        sourceLocation: 'country_stock',
        sourceLocationType: 'country',
        destinationLocation: warehouseId,
        destinationLocationType: 'warehouse',
      });
      allRecomputeTargets.push(...recv.recomputeTargets);

      // 3. FIFO deduct from country_stock stock_batches
      const batchRows = await client.query(
        `SELECT id, remaining_quantity
         FROM stock_batches
         WHERE location = 'country_stock'
           AND LOWER(TRIM(description)) = LOWER(TRIM($1))
           AND COALESCE(batch_no,'') = COALESCE($2,'')
           AND remaining_quantity > 0
         ORDER BY import_date ASC, created_at ASC
         FOR UPDATE`,
        [productName, batchNo || null]
      );
      let remaining = qty;
      for (const row of batchRows.rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(row.remaining_quantity));
        await client.query(
          `UPDATE stock_batches
           SET remaining_quantity = remaining_quantity - $1,
               dispatched_quantity = COALESCE(dispatched_quantity,0) + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [take, row.id]
        );
        remaining -= take;
      }
      if (remaining > 0) {
        throw new Error(`Insufficient stock for ${productName} (shortfall: ${remaining})`);
      }

      // 4. Create warehouse stock_batches row
      const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
      const newBatchId = `WRECV-${Date.now()}-${rnd}`;
      const newBarcode = `BC-RECV-${(batchNo || 'NB')}-${Date.now().toString(36).toUpperCase()}-${rnd}`;
      const insertResult = await client.query(
        `INSERT INTO stock_batches
           (id, barcode, description, batch_no, expiry_date, quantity, remaining_quantity,
            dispatched_quantity, import_date, location, status, product_id, warehouse_id,
            supplier_name, import_reference, supplier_import_id,
            dpc_unit_value, cif_unit_cost, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6, 0,$7,$8,'available',$9,$8,$10,$11,$12,$13,$14,
           jsonb_build_object('received_from','country_stock','dispatch_ref',$15::text,'transfer_id',$16::text),
           NOW(),NOW())
         ON CONFLICT (barcode) DO NOTHING
         RETURNING id`,
        [
          newBatchId, newBarcode,
          productName, batchNo || null, expiryDate,
          qty,
          sb.import_date || null, warehouseId,
          sb.product_id || null, sb.supplier_name || null, sb.import_reference || null,
          sb.supplier_import_id || null,
          sb.dpc_unit_value || null, sb.cif_unit_cost || null,
          transfer.dispatch_reference || transferId,
          transferId,
        ]
      );

      // 5. Update transfer item quantity_received
      await client.query(
        `UPDATE stock_transfer_items
         SET quantity_received = $1
         WHERE transfer_id = $2 AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))`,
        [qty, transferId, productName]
      );
    }

    // 6. Mark transfer as received
    await client.query(
      `UPDATE stock_transfers
       SET status = 'received',
           received_by = $1::varchar,
           received_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [actor, transferId]
    );
  });

  // Recompute inventory balances outside the transaction
  const unique = [];
  const seen = new Set();
  for (const t of allRecomputeTargets) {
    const key = `${t.locationType}||${t.locationId}||${t.productName?.toLowerCase()?.trim()}||${t.batchNo || ''}`;
    if (!seen.has(key)) { seen.add(key); unique.push(t); }
  }
  await Promise.allSettled(unique.map(t => recomputeInventoryBalance(t)));

  publishRealtimeEvent('stock_transfers', 'update', { id: transferId, status: 'received', to_branch: warehouseId }).catch(() => {});
  broadcastStockEvent('warehouse_received', { transferId, warehouseId });

  return res.json({
    success: true,
    action: 'accepted',
    transferId,
    warehouseId,
    itemsReceived: itemRows.length,
    message: `${itemRows.length} item(s) received into ${warehouseId} from Country Stock.`,
  });
  } catch (err) {
    console.error('[receive-stock] Accept error:', err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to accept dispatch' });
  }
}
