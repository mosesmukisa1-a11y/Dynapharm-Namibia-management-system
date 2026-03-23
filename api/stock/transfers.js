import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent, withTransaction } from '../db.js';

async function fefoDeductStockBatches(client, locationFilter, productName, totalQty) {
  const batches = await client.query(
    `SELECT id, remaining_quantity FROM stock_batches
     WHERE (location = $1 OR warehouse_id = $1)
       AND description ILIKE $2
       AND remaining_quantity > 0
     ORDER BY expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [locationFilter, '%' + productName + '%']
  );
  let remaining = totalQty;
  for (const batch of batches.rows) {
    if (remaining <= 0) break;
    const deduct = Math.min(remaining, Number(batch.remaining_quantity));
    await client.query(
      `UPDATE stock_batches
       SET remaining_quantity = remaining_quantity - $1,
           dispatched_quantity = dispatched_quantity + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [deduct, batch.id]
    );
    remaining -= deduct;
  }
  return totalQty - remaining;
}

async function fefoDeductWarehouseInventory(client, warehouseId, productName, totalQty) {
  const inv = await client.query(
    `SELECT id, quantity FROM warehouse_inventory
     WHERE warehouse_id = $1
       AND product_name ILIKE $2
       AND quantity > 0
     ORDER BY expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [warehouseId, '%' + productName + '%']
  );
  let remaining = totalQty;
  for (const row of inv.rows) {
    if (remaining <= 0) break;
    const deduct = Math.min(remaining, Number(row.quantity));
    await client.query(
      `UPDATE warehouse_inventory
       SET quantity = quantity - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [deduct, row.id]
    );
    remaining -= deduct;
  }
  return totalQty - remaining;
}

function safeParseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeTransferItem(item) {
  if (!item || typeof item !== 'object') return null;
  const quantity = Number(item.quantity ?? item.qty ?? 0);
  return {
    productId: item.productId || item.id || item.sku || item.description || 'UNKNOWN',
    productName: item.productName || item.description || item.productId || 'Item',
    batchNo: item.batchNo || item.batch || item.batch_no || null,
    expiryDate: item.expiryDate || item.expiry_date || item.expiry || null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    quantityApproved: item.quantityApproved != null ? Number(item.quantityApproved) : null,
    quantityReceived: item.quantityReceived != null ? Number(item.quantityReceived) : null,
    discrepancyNote: item.discrepancyNote || item.discrepancy_note || null,
    unit: item.unit || item.uom || 'units',
    metadata: item.metadata || null,
  };
}

function parseItems(items) {
  if (!items) return [];
  if (typeof items === 'string') {
    try {
      return parseItems(JSON.parse(items));
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map(normalizeTransferItem).filter(Boolean).filter((item) => item.quantity > 0);
}

async function replaceTransferItems(transferId, items) {
  await query('DELETE FROM stock_transfer_items WHERE transfer_id = $1', [transferId]);
  if (!Array.isArray(items) || items.length === 0) return;

  const values = [];
  const params = [];
  items.forEach((item, index) => {
    const position = index * 11;
    values.push(`($${position + 1}, $${position + 2}, $${position + 3}, $${position + 4}, $${position + 5}, $${position + 6}, $${position + 7}, $${position + 8}, $${position + 9}, $${position + 10}, $${position + 11})`);
    params.push(
      transferId,
      item.productId,
      item.productName || null,
      item.batchNo || null,
      item.expiryDate || null,
      item.quantity,
      item.quantityApproved != null ? item.quantityApproved : null,
      item.quantityReceived != null ? item.quantityReceived : null,
      item.discrepancyNote || null,
      item.unit || 'units',
      item.metadata ? JSON.stringify(item.metadata) : null
    );
  });

  await query(
    `
      INSERT INTO stock_transfer_items
        (transfer_id, product_id, product_name, batch_no, expiry_date, quantity, quantity_approved, quantity_received, discrepancy_note, unit, metadata)
      VALUES ${values.join(', ')}
    `,
    params
  );
}

async function loadTransferItems(transferIds) {
  if (!Array.isArray(transferIds) || transferIds.length === 0) return new Map();
  const rows = await getMany(
    `
      SELECT *
      FROM stock_transfer_items
      WHERE transfer_id = ANY($1::text[])
      ORDER BY created_at ASC
    `,
    [transferIds]
  );
  const map = new Map();
  rows.forEach((row) => {
    const item = {
      id: row.id,
      transferId: row.transfer_id,
      productId: row.product_id,
      productName: row.product_name,
      batchNo: row.batch_no,
      expiryDate: row.expiry_date instanceof Date ? row.expiry_date.toISOString().split('T')[0] : (row.expiry_date || null),
      quantity: Number(row.quantity || 0),
      quantityApproved: row.quantity_approved != null ? Number(row.quantity_approved) : null,
      quantityReceived: row.quantity_received != null ? Number(row.quantity_received) : null,
      discrepancyNote: row.discrepancy_note || null,
      unit: row.unit || 'units',
      metadata: safeParseJson(row.metadata),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
    if (!map.has(row.transfer_id)) {
      map.set(row.transfer_id, []);
    }
    map.get(row.transfer_id).push(item);
  });
  return map;
}

async function loadDispatchNotes(transferIds) {
  if (!Array.isArray(transferIds) || transferIds.length === 0) return new Map();
  const rows = await getMany(
    `
      SELECT *
      FROM dispatch_notes
      WHERE transfer_id = ANY($1::text[])
      ORDER BY created_at DESC
    `,
    [transferIds]
  );
  const map = new Map();
  rows.forEach((row) => {
    const note = {
      id: row.id,
      transferId: row.transfer_id,
      requestId: row.request_id,
      barcode: row.barcode,
      fromWarehouse: row.from_warehouse,
      toBranch: row.to_branch,
      status: row.status,
      expectedArrival: row.expected_arrival instanceof Date ? row.expected_arrival.toISOString() : row.expected_arrival,
      dispatchedBy: row.dispatched_by,
      dispatchedAt: row.dispatched_at instanceof Date ? row.dispatched_at.toISOString() : row.dispatched_at,
      receivedBy: row.received_by,
      receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
      metadata: safeParseJson(row.metadata),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
    map.set(row.transfer_id, note);
  });
  return map;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function generateDispatchBarcode(transfer) {
  const base = `${transfer.request_number || transfer.id || 'TRF'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `DN-${base}`.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

async function createDispatchNote(transfer, actor, metadata = {}) {
  const id = generateId('NOTE');
  const barcode = generateDispatchBarcode(transfer);
  const now = new Date().toISOString();
  const row = await query(
    `
      INSERT INTO dispatch_notes (
        id, transfer_id, request_id, barcode, from_warehouse, to_branch,
        status, expected_arrival, dispatched_by, dispatched_at, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        'in_transit', $7, $8, $9, $10, $11, $11
      )
      ON CONFLICT (transfer_id) DO UPDATE SET
        barcode = EXCLUDED.barcode,
        from_warehouse = EXCLUDED.from_warehouse,
        to_branch = EXCLUDED.to_branch,
        dispatched_by = EXCLUDED.dispatched_by,
        dispatched_at = EXCLUDED.dispatched_at,
        expected_arrival = EXCLUDED.expected_arrival,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      id,
      transfer.id,
      transfer.request_id || null,
      barcode,
      transfer.from_warehouse || null,
      transfer.to_branch || null,
      metadata?.expectedArrival || null,
      actor || null,
      now,
      metadata ? JSON.stringify(metadata) : null,
      now,
    ]
  );
  return row.rows[0];
}

function normalizeTransfer(row, itemsMap, notesMap) {
  const items = itemsMap.get(row.id) || [];
  const meta = safeParseJson(row.metadata) || {};
  const firstItem = items[0] || null;
  return {
    id: row.id,
    requestId: row.request_id,
    requestNumber: row.request_number,
    from_location: row.from_warehouse,
    to_location: row.to_branch,
    fromWarehouse: row.from_warehouse,
    toBranch: row.to_branch,
    status: row.status,
    product_name: meta.product_name || (firstItem ? firstItem.productName : null),
    quantity: meta.quantity || (firstItem ? firstItem.quantity : null),
    dispatchReference: row.dispatch_reference,
    dispatchNotes: row.dispatch_notes,
    dispatchedBy: row.dispatched_by,
    dispatchedAt: row.dispatched_at instanceof Date ? row.dispatched_at.toISOString() : row.dispatched_at,
    deliveredBy: row.delivered_by,
    deliveredAt: row.delivered_at instanceof Date ? row.delivered_at.toISOString() : row.delivered_at,
    receivedBy: row.received_by,
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    gmAction: row.gm_action || meta.gm_action || null,
    gmComment: row.gm_comment || meta.gm_comment || null,
    amendedByGm: row.amended_by_gm || meta.amended_by_gm || null,
    amendedAt: row.amended_at instanceof Date ? row.amended_at.toISOString() : (row.amended_at || null),
    signatureName: row.signature_name || null,
    branchReceiptNote: row.branch_receipt_note || null,
    discrepancyFlag: row.discrepancy_flag || false,
    receiptStatus: row.receipt_status || null,
    metadata: meta,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    items,
    dispatchNote: notesMap.get(row.id) || null,
  };
}

async function listTransfers(searchParams) {
  const id = searchParams.get('id');
  if (id) {
    const row = await getOne('SELECT * FROM stock_transfers WHERE id = $1', [id]);
    if (!row) {
      return [];
    }
    const [itemsMap, notesMap] = await Promise.all([
      loadTransferItems([row.id]),
      loadDispatchNotes([row.id]),
    ]);
    return [normalizeTransfer(row, itemsMap, notesMap)];
  }

  const status = searchParams.get('status');
  const toBranch = searchParams.get('branch') || searchParams.get('toBranch');
  const fromWarehouse = searchParams.get('fromWarehouse');
  const requestId = searchParams.get('requestId');
  const limit = parseInt(searchParams.get('limit') || '200', 10);

  const params = [];
  const conditions = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (toBranch && toBranch !== 'all') {
    params.push(toBranch);
    conditions.push(`to_branch = $${params.length}`);
  }
  if (fromWarehouse && fromWarehouse !== 'all') {
    params.push(fromWarehouse);
    conditions.push(`from_warehouse = $${params.length}`);
  }
  if (requestId) {
    params.push(requestId);
    conditions.push(`request_id = $${params.length}`);
  }

  let queryText = 'SELECT * FROM stock_transfers';
  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }
  queryText += ' ORDER BY created_at DESC';

  if (!Number.isNaN(limit) && limit > 0) {
    queryText += ` LIMIT ${Math.min(limit, 1000)}`;
  }

  const rows = await getMany(queryText, params);
  const ids = rows.map((row) => row.id);
  const [itemsMap, notesMap] = await Promise.all([
    loadTransferItems(ids),
    loadDispatchNotes(ids),
  ]);

  return rows.map((row) => normalizeTransfer(row, itemsMap, notesMap));
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const currentUser = req.user || null;

  try {
    if (req.method === 'GET') {
      const transfers = await listTransfers(searchParams);
      return res.status(200).json({ success: true, transfers });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const items = parseItems(body.items || body.itemsArray);

      const toLocation = body.toBranch || body.to_branch || body.to_location || body.toWarehouse || body.to_warehouse || null;
      const fromLocation = body.fromWarehouse || body.from_warehouse || body.from_location || body.fromLocation || null;

      if (!toLocation) {
        return res.status(400).json({ success: false, error: 'Destination location is required' });
      }

      const transferData = {
        id: body.id || generateId('TRF'),
        request_id: body.requestId || body.request_id || null,
        request_number: body.requestNumber || body.request_number || null,
        from_warehouse: fromLocation,
        to_branch: toLocation,
        status: body.status || 'pending',
        dispatch_reference: body.dispatchReference || body.dispatch_reference || null,
        dispatch_notes: body.dispatchNotes || body.dispatch_notes || null,
        dispatched_by: body.dispatchedBy || null,
        dispatched_at: body.dispatchedAt || null,
        delivered_by: body.deliveredBy || null,
        delivered_at: body.deliveredAt || null,
        received_by: body.receivedBy || null,
        received_at: body.receivedAt || null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        created_by: currentUser?.fullName || currentUser?.username || body.createdBy || null,
      };

      Object.keys(transferData).forEach((key) => {
        if (transferData[key] === undefined) delete transferData[key];
      });

      const productName = body.product_name || body.productName || null;
      const quantity = Number(body.quantity || 0);
      if (productName && quantity > 0) {
        transferData.metadata = JSON.stringify({
          ...(body.metadata || {}),
          product_name: productName,
          quantity,
          notes: body.notes || null,
        });
      }

      const transfer = await insert('stock_transfers', transferData);

      let finalItems = items;
      if (finalItems.length === 0 && productName && quantity > 0) {
        finalItems = [{ productId: productName, productName, quantity, unit: 'units', batchNo: null, metadata: null }];
      }
      await replaceTransferItems(transfer.id, finalItems);

      let dispatchNote = null;
      if (transfer.status === 'dispatched') {
        dispatchNote = await createDispatchNote(transfer, transfer.dispatched_by || transferData.created_by, body.dispatchMeta || {});
      }

      await publishRealtimeEvent('stock_transfers', 'create', transfer);

      const itemsMap = await loadTransferItems([transfer.id]);
      const notesMap = new Map();
      if (dispatchNote) {
        notesMap.set(transfer.id, {
          id: dispatchNote.id,
          transferId: dispatchNote.transfer_id,
          requestId: dispatchNote.request_id,
          barcode: dispatchNote.barcode,
          fromWarehouse: dispatchNote.from_warehouse,
          toBranch: dispatchNote.to_branch,
          status: dispatchNote.status,
          expectedArrival: dispatchNote.expected_arrival,
          dispatchedBy: dispatchNote.dispatched_by,
          dispatchedAt: dispatchNote.dispatched_at,
          receivedBy: dispatchNote.received_by,
          receivedAt: dispatchNote.received_at,
          metadata: safeParseJson(dispatchNote.metadata),
          createdAt: dispatchNote.created_at,
          updatedAt: dispatchNote.updated_at,
        });
      }

      return res.status(201).json({
        success: true,
        transfer: normalizeTransfer(transfer, itemsMap, notesMap),
      });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseBody(req);
      const id = body.id || searchParams.get('id');
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const updatePayload = { ...body };
      delete updatePayload.id;
      delete updatePayload.items;
      delete updatePayload.itemsArray;
      delete updatePayload.dispatchMeta;

      if (updatePayload.from_location) {
        updatePayload.from_warehouse = updatePayload.from_location;
        delete updatePayload.from_location;
      }
      if (updatePayload.fromWarehouse) {
        updatePayload.from_warehouse = updatePayload.fromWarehouse;
        delete updatePayload.fromWarehouse;
      }
      if (updatePayload.fromLocation) {
        updatePayload.from_warehouse = updatePayload.fromLocation;
        delete updatePayload.fromLocation;
      }
      if (updatePayload.to_location) {
        updatePayload.to_branch = updatePayload.to_location;
        delete updatePayload.to_location;
      }
      if (updatePayload.toBranch) {
        updatePayload.to_branch = updatePayload.toBranch;
        delete updatePayload.toBranch;
      }
      if (updatePayload.toWarehouse) {
        updatePayload.to_branch = updatePayload.toWarehouse;
        delete updatePayload.toWarehouse;
      }
      if (updatePayload.to_warehouse) {
        updatePayload.to_branch = updatePayload.to_warehouse;
        delete updatePayload.to_warehouse;
      }

      const nowIso = new Date().toISOString();
      if (body.status) {
        switch (body.status) {
          case 'dispatched':
            updatePayload.dispatched_at = body.dispatchedAt || nowIso;
            updatePayload.dispatched_by =
              body.dispatchedBy || currentUser?.fullName || currentUser?.username || updatePayload.dispatched_by || null;
            break;
          case 'delivered':
            updatePayload.delivered_at = body.deliveredAt || nowIso;
            updatePayload.delivered_by =
              body.deliveredBy || currentUser?.fullName || currentUser?.username || updatePayload.delivered_by || null;
            break;
          case 'received':
            updatePayload.received_at = body.receivedAt || nowIso;
            updatePayload.received_by =
              body.receivedBy || currentUser?.fullName || currentUser?.username || updatePayload.received_by || null;
            break;
          default:
            break;
        }
      }

      if (updatePayload.notes !== undefined) {
        updatePayload.dispatch_notes = updatePayload.dispatch_notes || updatePayload.notes || null;
        delete updatePayload.notes;
      }
      if (updatePayload.decisionNotes !== undefined) {
        updatePayload.dispatch_notes = updatePayload.decisionNotes || updatePayload.dispatch_notes || null;
        delete updatePayload.decisionNotes;
      }

      if (updatePayload.gmAction || updatePayload.gm_action) {
        updatePayload.gm_action = updatePayload.gmAction || updatePayload.gm_action;
        delete updatePayload.gmAction;
      }
      if (updatePayload.gmComment || updatePayload.gm_comment) {
        updatePayload.gm_comment = updatePayload.gmComment || updatePayload.gm_comment;
        delete updatePayload.gmComment;
      }
      if (updatePayload.amendedByGm || updatePayload.amended_by_gm) {
        updatePayload.amended_by_gm = updatePayload.amendedByGm || updatePayload.amended_by_gm;
        delete updatePayload.amendedByGm;
      }
      if (updatePayload.signatureName || updatePayload.signature_name) {
        updatePayload.signature_name = updatePayload.signatureName || updatePayload.signature_name;
        delete updatePayload.signatureName;
      }
      if (updatePayload.branchReceiptNote || updatePayload.branch_receipt_note) {
        updatePayload.branch_receipt_note = updatePayload.branchReceiptNote || updatePayload.branch_receipt_note;
        delete updatePayload.branchReceiptNote;
      }
      if (updatePayload.discrepancyFlag !== undefined || updatePayload.discrepancy_flag !== undefined) {
        updatePayload.discrepancy_flag = updatePayload.discrepancyFlag ?? updatePayload.discrepancy_flag ?? false;
        delete updatePayload.discrepancyFlag;
      }
      if (updatePayload.receiptStatus || updatePayload.receipt_status) {
        updatePayload.receipt_status = updatePayload.receiptStatus || updatePayload.receipt_status;
        delete updatePayload.receiptStatus;
      }

      const metaExtras = {};
      if (updatePayload.approved_by) { metaExtras.approved_by = updatePayload.approved_by; delete updatePayload.approved_by; }
      if (updatePayload.approvedBy) { metaExtras.approved_by = updatePayload.approvedBy; delete updatePayload.approvedBy; }
      if (updatePayload.rejected_by) { metaExtras.rejected_by = updatePayload.rejected_by; delete updatePayload.rejected_by; }

      if (body.gmAction === 'amend_approve' || body.gm_action === 'amend_approve') {
        updatePayload.amended_by_gm = metaExtras.approved_by || currentUser?.fullName || currentUser?.username || 'GM';
        updatePayload.amended_at = new Date().toISOString();
        metaExtras.amended = true;
        metaExtras.amendment_date = updatePayload.amended_at;
        if (body.amendmentLog) {
          metaExtras.amendment_log = body.amendmentLog;
        }
      }

      if (Object.keys(metaExtras).length > 0) {
        const existingMeta = updatePayload.metadata ? (typeof updatePayload.metadata === 'string' ? JSON.parse(updatePayload.metadata) : updatePayload.metadata) : {};
        updatePayload.metadata = JSON.stringify({ ...existingMeta, ...metaExtras });
      }

      if (updatePayload.metadata && typeof updatePayload.metadata === 'object') {
        updatePayload.metadata = JSON.stringify(updatePayload.metadata);
      }

      const oldTransfer = await getOne('SELECT status, from_warehouse, to_branch FROM stock_transfers WHERE id = $1', [id]);
      const previousStatus = oldTransfer?.status;

      const transfer = await update('stock_transfers', id, updatePayload, 'id');

      if (body.items !== undefined || body.itemsArray !== undefined) {
        const normalizedItems = parseItems(body.items || body.itemsArray);
        await replaceTransferItems(id, normalizedItems);
      }

      const transferItems = await getMany(
        'SELECT * FROM stock_transfer_items WHERE transfer_id = $1',
        [id]
      );

      const statusChanged = transfer.status !== previousStatus;
      if (statusChanged && transferItems.length > 0) {
        await withTransaction(async (client) => {
          const actorName = transfer.received_by || transfer.dispatched_by || transfer.delivered_by || currentUser?.fullName || null;

          if (transfer.status === 'received' && previousStatus !== 'received') {
            const destWarehouse = transfer.to_branch || transfer.from_warehouse || null;
            for (const item of transferItems) {
              const qty = Number(item.quantity || 0);
              if (qty <= 0) continue;
              const productName = item.product_name || item.product_id || 'Unknown';
              const batchNo = item.batch_no || null;
              const expiryDate = item.expiry_date || null;
              const productId = item.product_id || productName;

              await fefoDeductStockBatches(client, 'country_stock', productName, qty);

              const whBatchId = `WH-RCV-${id.slice(-6)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const existing = await client.query(
                `SELECT id FROM warehouse_inventory
                 WHERE warehouse_id = $1 AND product_id = $2
                   AND COALESCE(batch_no, '') = COALESCE($3, '')
                   AND COALESCE(expiry_date::text, '') = COALESCE($4, '')
                 FOR UPDATE`,
                [destWarehouse, productId, batchNo, expiryDate]
              );
              if (existing.rows.length > 0) {
                await client.query(
                  `UPDATE warehouse_inventory SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
                  [qty, existing.rows[0].id]
                );
              } else {
                await client.query(
                  `INSERT INTO warehouse_inventory (id, warehouse_id, product_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', NOW(), NOW())`,
                  [whBatchId, destWarehouse, productId, productName, batchNo, expiryDate, qty]
                );
              }

              const movId = `MOV-RCV-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, 'transfer_in', 'country_stock', $4, $5, $6, $7, NOW(), NOW())`,
                [movId, productName, qty, destWarehouse || 'warehouse', id,
                 `Received from Country Stock — transfer ${id}`, actorName]
              );
            }
          }

          if (transfer.status === 'approved' && previousStatus !== 'approved' && previousStatus !== 'dispatched') {
            const sourceWarehouse = transfer.from_warehouse || null;
            if (sourceWarehouse) {
              for (const item of transferItems) {
                const qtyToReserve = Number(item.quantity_approved ?? item.quantity ?? 0);
                if (qtyToReserve <= 0) continue;
                const productName = item.product_name || item.product_id || 'Unknown';

                await fefoDeductStockBatches(client, sourceWarehouse, productName, qtyToReserve);
                await fefoDeductWarehouseInventory(client, sourceWarehouse, productName, qtyToReserve);

                const movId = `MOV-APR-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
                await client.query(
                  `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
                   VALUES ($1, $2, $3, 'reserved', $4, $5, $6, $7, $8, NOW(), NOW())`,
                  [movId, productName, qtyToReserve, sourceWarehouse, transfer.to_branch || 'branch', id,
                   `GM approved — stock reserved for ${transfer.to_branch || 'branch'} — transfer ${id}`, actorName]
                );
              }
            }
          }

          if (transfer.status === 'dispatched' && previousStatus !== 'dispatched') {
            const sourceWarehouse = transfer.from_warehouse || null;
            const alreadyDeducted = previousStatus === 'approved';
            for (const item of transferItems) {
              const qty = Number(item.quantity || 0);
              if (qty <= 0) continue;
              const productName = item.product_name || item.product_id || 'Unknown';

              if (!alreadyDeducted && sourceWarehouse) {
                await fefoDeductStockBatches(client, sourceWarehouse, productName, qty);
                await fefoDeductWarehouseInventory(client, sourceWarehouse, productName, qty);
              }

              const movId = `MOV-DSP-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, 'transfer_out', $4, $5, $6, $7, $8, NOW(), NOW())`,
                [movId, productName, qty, sourceWarehouse || 'warehouse', transfer.to_branch || 'branch', id,
                 `Dispatched to ${transfer.to_branch || 'branch'} — transfer ${id}`, actorName]
              );
            }
          }

          if ((transfer.status === 'delivered' || transfer.status === 'partially_received') && previousStatus !== 'delivered' && previousStatus !== 'partially_received') {
            const branchId = transfer.to_branch || null;
            for (const item of transferItems) {
              const qtyReceived = Number(item.quantity_received ?? item.quantity ?? 0);
              if (qtyReceived <= 0) continue;
              const productName = item.product_name || item.product_id || 'Unknown';
              const batchNo = item.batch_no || null;
              const expiryDate = item.expiry_date || null;

              const batchId = `BIB-${id.slice(-6)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const existingBranch = await client.query(
                `SELECT id FROM branch_inventory_batches
                 WHERE branch_id = $1 AND product_name = $2
                   AND COALESCE(batch_no, '') = COALESCE($3, '')
                   AND COALESCE(expiry_date::text, '') = COALESCE($4, '')
                 FOR UPDATE`,
                [branchId, productName, batchNo, expiryDate]
              );
              if (existingBranch.rows.length > 0) {
                await client.query(
                  `UPDATE branch_inventory_batches SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
                  [qtyReceived, existingBranch.rows[0].id]
                );
              } else {
                await client.query(
                  `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, 'in_stock', NOW(), NOW())`,
                  [batchId, branchId, productName, batchNo, expiryDate, qtyReceived]
                );
              }

              const bimId = `BIM-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
                 VALUES ($1, $2, 'receive', $3, $4, $5, $6, $7, $8, NOW())`,
                [bimId, branchId, productName, batchNo, qtyReceived, id,
                 `Received from warehouse — transfer ${id}${item.discrepancy_note ? ` (${item.discrepancy_note})` : ''}`, actorName]
              );

              const movId = `MOV-BRC-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, 'transfer_in', $4, $5, $6, $7, $8, NOW(), NOW())`,
                [movId, productName, qtyReceived, transfer.from_warehouse || 'warehouse', branchId || 'branch', id,
                 `Branch received from warehouse — transfer ${id}`, actorName]
              );
            }
          }
        });
      }

      let dispatchNote = null;
      if (transfer.status === 'dispatched') {
        dispatchNote = await createDispatchNote(transfer, transfer.dispatched_by, body.dispatchMeta || {});
      }
      if (transfer.status === 'received') {
        await query(
          `
            UPDATE dispatch_notes
            SET status = 'received',
                received_at = COALESCE(received_at, NOW()),
                received_by = COALESCE(received_by, $2),
                updated_at = NOW()
            WHERE transfer_id = $1
          `,
          [transfer.id, transfer.received_by || null]
        );
      }

      await publishRealtimeEvent('stock_transfers', 'update', transfer);

      const itemsMap = await loadTransferItems([transfer.id]);
      const notesMap = await loadDispatchNotes([transfer.id]);
      if (dispatchNote) {
        notesMap.set(transfer.id, {
          id: dispatchNote.id,
          transferId: dispatchNote.transfer_id,
          requestId: dispatchNote.request_id,
          barcode: dispatchNote.barcode,
          fromWarehouse: dispatchNote.from_warehouse,
          toBranch: dispatchNote.to_branch,
          status: dispatchNote.status,
          expectedArrival: dispatchNote.expected_arrival,
          dispatchedBy: dispatchNote.dispatched_by,
          dispatchedAt: dispatchNote.dispatched_at,
          receivedBy: dispatchNote.received_by,
          receivedAt: dispatchNote.received_at,
          metadata: safeParseJson(dispatchNote.metadata),
          createdAt: dispatchNote.created_at,
          updatedAt: dispatchNote.updated_at,
        });
      }

      return res.status(200).json({
        success: true,
        transfer: normalizeTransfer(transfer, itemsMap, notesMap),
      });
    }

    if (req.method === 'DELETE') {
      const id = searchParams.get('id');
      if (!id) {
        return res.status(400).json({ success: false, error: 'id query parameter is required' });
      }
      await remove('stock_transfers', id, 'id');
      await query('DELETE FROM stock_transfer_items WHERE transfer_id = $1', [id]);
      await query('DELETE FROM dispatch_notes WHERE transfer_id = $1', [id]);
      await publishRealtimeEvent('stock_transfers', 'delete', { id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock transfers API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


