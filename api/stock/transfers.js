import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

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
    batchNo: item.batchNo || item.batch || null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
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
    const position = index * 7;
    values.push(`($${position + 1}, $${position + 2}, $${position + 3}, $${position + 4}, $${position + 5}, $${position + 6}, $${position + 7})`);
    params.push(
      transferId,
      item.productId,
      item.productName || null,
      item.batchNo || null,
      item.quantity,
      item.unit || 'units',
      item.metadata ? JSON.stringify(item.metadata) : null
    );
  });

  await query(
    `
      INSERT INTO stock_transfer_items
        (transfer_id, product_id, product_name, batch_no, quantity, unit, metadata)
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
      quantity: Number(row.quantity || 0),
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
  return {
    id: row.id,
    requestId: row.request_id,
    requestNumber: row.request_number,
    fromWarehouse: row.from_warehouse,
    toBranch: row.to_branch,
    status: row.status,
    dispatchReference: row.dispatch_reference,
    dispatchNotes: row.dispatch_notes,
    dispatchedBy: row.dispatched_by,
    dispatchedAt: row.dispatched_at instanceof Date ? row.dispatched_at.toISOString() : row.dispatched_at,
    deliveredBy: row.delivered_by,
    deliveredAt: row.delivered_at instanceof Date ? row.delivered_at.toISOString() : row.delivered_at,
    receivedBy: row.received_by,
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    metadata: safeParseJson(row.metadata),
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    items: itemsMap.get(row.id) || [],
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
      if (!body.toBranch) {
        return res.status(400).json({ success: false, error: 'toBranch is required' });
      }

      const transferData = {
        id: body.id || generateId('TRF'),
        request_id: body.requestId || body.request_id || null,
        request_number: body.requestNumber || body.request_number || null,
        from_warehouse: body.fromWarehouse || body.from_warehouse || null,
        to_branch: body.toBranch,
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

      const transfer = await insert('stock_transfers', transferData);
      await replaceTransferItems(transfer.id, items);

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

      if (updatePayload.metadata && typeof updatePayload.metadata === 'object') {
        updatePayload.metadata = JSON.stringify(updatePayload.metadata);
      }

      const transfer = await update('stock_transfers', id, updatePayload, 'id');

      if (body.items !== undefined || body.itemsArray !== undefined) {
        const normalizedItems = parseItems(body.items || body.itemsArray);
        await replaceTransferItems(id, normalizedItems);
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
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}


