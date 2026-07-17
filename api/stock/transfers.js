import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent, withTransaction } from '../db.js';
import { recomputeLocationBalances, inferLocationType } from '../services/stockEngine.js';
import { broadcastStockEvent } from '../services/stockEvents.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { checkAutoApproveTransfer } from '../services/stockAutomation.js';

async function fefoDeductStockBatches(client, locationFilter, productName, totalQty) {
  const batches = await client.query(
    `SELECT id, remaining_quantity FROM stock_batches
     WHERE (location = $1 OR warehouse_id = $1)
       AND (LOWER(description) = LOWER($2) OR description ILIKE $3)
       AND remaining_quantity > 0
     ORDER BY
       CASE WHEN LOWER(description) = LOWER($2) THEN 0 ELSE 1 END,
       expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [locationFilter, productName, '%' + productName + '%']
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
       AND (LOWER(product_name) = LOWER($2) OR product_name ILIKE $3)
       AND quantity > 0
     ORDER BY
       CASE WHEN LOWER(product_name) = LOWER($2) THEN 0 ELSE 1 END,
       expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [warehouseId, productName, '%' + productName + '%']
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

async function fefoDeductBranchInventoryBatches(client, branchId, productName, totalQty) {
  const batches = await client.query(
    `SELECT id, quantity FROM branch_inventory_batches
     WHERE branch_id = $1
       AND (LOWER(product_name) = LOWER($2) OR product_name ILIKE $3)
       AND quantity > 0
       AND status != 'expired'
     ORDER BY
       CASE WHEN LOWER(product_name) = LOWER($2) THEN 0 ELSE 1 END,
       expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [branchId, productName, '%' + productName + '%']
  );
  let remaining = totalQty;
  for (const row of batches.rows) {
    if (remaining <= 0) break;
    const deduct = Math.min(remaining, Number(row.quantity));
    await client.query(
      `UPDATE branch_inventory_batches
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
    productId: item.productId || item.id || item.sku || item.product_name || item.description || 'UNKNOWN',
    productName: item.productName || item.product_name || item.description || item.productId || 'Item',
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

function parseItems(items, keepZeroQty = false) {
  if (!items) return [];
  if (typeof items === 'string') {
    try {
      return parseItems(JSON.parse(items), keepZeroQty);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map(normalizeTransferItem).filter(Boolean).filter((item) => keepZeroQty ? item.quantity >= 0 : item.quantity > 0);
}

/**
 * Enrich transfer items with batch_no and expiry_date from stock_batches / supplier_imports.
 * This is the canonical gateway that ensures the supplier-import batch_no is always preserved:
 *  1. Items missing batchNo → look up FIFO from stock_batches at the source location (or supplier_imports).
 *  2. Items with batchNo but missing expiryDate → look up expiry from stock_batches.
 */
async function enrichItemsWithBatchExpiry(items, sourceLocation) {
  // Collect product names that need a batch_no resolved
  const productsNeedingBatch = items.filter(item => !item.batchNo && item.productName);
  // Collect batch_nos that have a batch_no but need expiry resolved
  const batchNosNeedingExpiry = [...new Set(
    items
      .filter(item => item.batchNo && !item.expiryDate)
      .map(item => item.batchNo)
  )];

  // Resolve missing batch_no values by looking up the FIFO-first batch from stock_batches
  // (falling back to supplier_imports if no stock_batches row found).
  let productBatchMap = {}; // productName → { batchNo, expiryDate }
  if (productsNeedingBatch.length > 0) {
    const productNames = [...new Set(productsNeedingBatch.map(i => i.productName))];
    try {
      for (const productName of productNames) {
        // Primary: look up stock_batches at source location (FIFO by expiry/import_date)
        const locationFilter = sourceLocation
          ? `AND (LOWER(TRIM(location)) = LOWER(TRIM($2)) OR LOWER(TRIM(warehouse_id)) = LOWER(TRIM($2)))`
          : '';
        const params = sourceLocation
          ? [productName, sourceLocation]
          : [productName];
        const batchRow = await getMany(
          `SELECT batch_no, expiry_date, dpc_unit_value, cif_unit_cost
           FROM stock_batches
           WHERE LOWER(TRIM(description)) = LOWER(TRIM($1))
             AND remaining_quantity > 0
             AND status != 'expired'
             ${locationFilter}
           ORDER BY expiry_date ASC NULLS LAST, import_date ASC
           LIMIT 1`,
          params
        );
        if (batchRow.length > 0 && batchRow[0].batch_no) {
          const row = batchRow[0];
          productBatchMap[productName.toLowerCase()] = {
            batchNo: row.batch_no,
            expiryDate: row.expiry_date instanceof Date
              ? row.expiry_date.toISOString().split('T')[0]
              : (row.expiry_date || null),
          };
        } else {
          // Fallback: look up from supplier_imports (the canonical user-entered batch_no)
          const siRow = await getMany(
            `SELECT batch_no, expiry_date FROM supplier_imports
             WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
               AND batch_no IS NOT NULL
             ORDER BY created_at DESC LIMIT 1`,
            [productName]
          );
          if (siRow.length > 0 && siRow[0].batch_no) {
            productBatchMap[productName.toLowerCase()] = {
              batchNo: siRow[0].batch_no,
              expiryDate: siRow[0].expiry_date instanceof Date
                ? siRow[0].expiry_date.toISOString().split('T')[0]
                : (siRow[0].expiry_date || null),
            };
          }
        }
      }
    } catch (e) {
      console.warn('[transfers] Could not look up batch_no for items:', e.message);
    }
  }

  // Resolve missing expiry for items that already have a batch_no
  let batchExpiryMap = {};
  if (batchNosNeedingExpiry.length > 0) {
    try {
      const batchRows = await getMany(
        `SELECT batch_no, expiry_date FROM stock_batches WHERE batch_no = ANY($1::text[]) AND expiry_date IS NOT NULL`,
        [batchNosNeedingExpiry]
      );
      batchRows.forEach(row => {
        if (row.batch_no && row.expiry_date && !batchExpiryMap[row.batch_no]) {
          batchExpiryMap[row.batch_no] = row.expiry_date instanceof Date
            ? row.expiry_date.toISOString().split('T')[0]
            : row.expiry_date;
        }
      });
    } catch (e) {
      console.warn('[transfers] Could not look up batch expiry dates:', e.message);
    }
  }

  return items.map(item => {
    const key = (item.productName || '').toLowerCase();
    const resolved = productBatchMap[key];
    return {
      ...item,
      batchNo: item.batchNo || resolved?.batchNo || null,
      expiryDate: item.expiryDate
        || (item.batchNo ? batchExpiryMap[item.batchNo] : null)
        || resolved?.expiryDate
        || null,
    };
  });
}

async function replaceTransferItems(transferId, items, sourceLocation) {
  await query('DELETE FROM stock_transfer_items WHERE transfer_id = $1', [transferId]);
  if (!Array.isArray(items) || items.length === 0) return;

  const enrichedItems = await enrichItemsWithBatchExpiry(items, sourceLocation || null);

  const values = [];
  const params = [];
  enrichedItems.forEach((item, index) => {
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

  // Load-time fallback: collect unique batch_nos where expiry_date is null for secondary lookup
  const batchNosNeedingLookup = [...new Set(
    rows
      .filter(row => row.batch_no && !row.expiry_date)
      .map(row => row.batch_no)
  )];

  let batchExpiryFallbackMap = {};
  if (batchNosNeedingLookup.length > 0) {
    try {
      const batchRows = await getMany(
        `SELECT batch_no, expiry_date FROM stock_batches WHERE batch_no = ANY($1::text[]) AND expiry_date IS NOT NULL`,
        [batchNosNeedingLookup]
      );
      batchRows.forEach(row => {
        if (row.batch_no && row.expiry_date && !batchExpiryFallbackMap[row.batch_no]) {
          batchExpiryFallbackMap[row.batch_no] = row.expiry_date instanceof Date
            ? row.expiry_date.toISOString().split('T')[0]
            : row.expiry_date;
        }
      });
    } catch (e) {
      console.warn('[transfers] Could not look up batch expiry dates for load-time fallback:', e.message);
    }
  }

  const map = new Map();
  rows.forEach((row) => {
    const storedExpiry = row.expiry_date instanceof Date ? row.expiry_date.toISOString().split('T')[0] : (row.expiry_date || null);
    const resolvedExpiry = storedExpiry || (row.batch_no ? (batchExpiryFallbackMap[row.batch_no] || null) : null);
    const item = {
      id: row.id,
      transferId: row.transfer_id,
      productId: row.product_id,
      productName: row.product_name,
      batchNo: row.batch_no,
      expiryDate: resolvedExpiry,
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
    gmApprovedAt: row.gm_approved_at instanceof Date ? row.gm_approved_at.toISOString() : (row.gm_approved_at || null),
    gmApprovedBy: row.gm_approved_by || null,
    amendedByGm: row.amended_by_gm || meta.amended_by_gm || null,
    amendedAt: row.amended_at instanceof Date ? row.amended_at.toISOString() : (row.amended_at || null),
    signatureName: row.signature_name || null,
    branchReceiptNote: row.branch_receipt_note || null,
    discrepancyFlag: row.discrepancy_flag || false,
    discrepancyNote: row.discrepancy_note || null,
    receiptStatus: row.receipt_status || null,
    preparedById: row.prepared_by_id || null,
    preparedByRole: row.prepared_by_role || null,
    destinationBranchStaff: safeParseJson(row.destination_branch_staff) || null,
    gmApprovedById: row.gm_approved_by_id || null,
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
    const terms = branchSearchTerms(toBranch);
    params.push(terms.length > 0 ? terms : [toBranch.toLowerCase()]);
    conditions.push(`LOWER(to_branch) = ANY($${params.length}::text[])`);
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

      // Snapshot destination branch staff at dispatch creation time
      let destinationBranchStaff = null;
      if (toLocation) {
        try {
          const branchStaff = await getMany(
            `SELECT id, full_name, role, branch, email, phone FROM users
             WHERE is_active = TRUE
               AND (REPLACE(LOWER(branch), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
                 OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements_text(COALESCE(branches, '[]'::jsonb)) AS b
                   WHERE REPLACE(LOWER(b), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
                 ))
             ORDER BY role ASC, full_name ASC`,
            [toLocation]
          );
          if (branchStaff.length > 0) {
            destinationBranchStaff = branchStaff.map(u => ({
              id: u.id,
              name: u.full_name || u.username || u.id,
              role: u.role,
              phone: u.phone || null,
              email: u.email || null,
            }));
          }
        } catch (e) {
          console.warn('[transfers] Could not snapshot destination branch staff:', e.message);
        }
      }

      // Preparer identity is always taken from the authenticated session (currentUser).
      // Body-supplied values are only used as a fallback for legacy/non-authenticated flows
      // where body.created_by is a display name entered by the client (not a security-sensitive ID).
      // The security-sensitive fields (preparedById, preparedByRole) are strictly from auth context.
      const preparedByName = currentUser?.fullName || currentUser?.username || body.createdBy || body.created_by || null;
      const preparedByRole = currentUser?.role || null;
      const preparedById = currentUser?.id || currentUser?.userId || null;

      const transferData = {
        id: body.id || generateId('TRF'),
        request_id: body.requestId || body.request_id || null,
        request_number: body.requestNumber || body.request_number || null,
        from_warehouse: fromLocation,
        to_branch: toLocation,
        status: body.status || 'pending_approval',
        dispatch_reference: body.dispatchReference || body.dispatch_reference || null,
        dispatch_notes: body.dispatchNotes || body.dispatch_notes || null,
        dispatched_by: body.dispatchedBy || null,
        dispatched_at: body.dispatchedAt || null,
        delivered_by: body.deliveredBy || null,
        delivered_at: body.deliveredAt || null,
        received_by: body.receivedBy || null,
        received_at: body.receivedAt || null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
        created_by: preparedByName,
        prepared_by_id: preparedById,
        prepared_by_role: preparedByRole,
        destination_branch_staff: destinationBranchStaff ? JSON.stringify(destinationBranchStaff) : null,
      };

      Object.keys(transferData).forEach((key) => {
        if (transferData[key] === undefined) delete transferData[key];
      });

      // POST-level hard gate: creating a dispatch directly in any stock-advancing status requires GM role.
      // Normal dispatch creation sets status to 'pending_approval'; only privileged callers (GM/admin)
      // can create directly in any advanced status (e.g., retroactive entries).
      // When a privileged caller creates in an advanced status, persist GM approval evidence immediately.
      const GM_ROLES_POST = ['gm', 'general_manager', 'director', 'admin', 'super_admin'];
      const ALL_STOCK_ADVANCING_STATUSES = ['approved', 'dispatched', 'in_transit', 'received', 'partially_received', 'delivered', 'completed'];
      const creationStatus = transferData.status || 'pending';
      if (ALL_STOCK_ADVANCING_STATUSES.includes(creationStatus)) {
        const callerRole = (currentUser?.role || '').toLowerCase().trim();
        if (!callerRole || !GM_ROLES_POST.includes(callerRole)) {
          return res.status(403).json({
            success: false,
            error: `Creating a dispatch with status '${creationStatus}' requires General Manager authorization. Use 'pending_approval' for normal dispatch creation.`,
          });
        }
        // Record GM approval evidence atomically for direct creation in advanced status
        transferData.gm_approved_at = new Date().toISOString();
        transferData.gm_approved_by = currentUser?.fullName || currentUser?.username || 'GM';
        transferData.gm_approved_by_id = currentUser?.id || currentUser?.userId || null;
      }

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

      // Server-side stock availability guard for warehouse→branch dispatches.
      // Prevents over-committing the same batch to multiple in-flight dispatches before GM approval.
      // We check: remaining_quantity (warehouse stock_batches) minus already-committed quantities
      // from other non-terminal transfers for the same warehouse must be >= requested qty.
      const WAREHOUSE_LOCATIONS = ['windhoek_warehouse', 'ondangwa_warehouse'];
      const IN_FLIGHT_STATUSES = ['pending', 'pending_approval', 'approved', 'dispatched', 'in_transit'];
      if (fromLocation && WAREHOUSE_LOCATIONS.includes(fromLocation) && items.length > 0) {
        const shortfalls = [];
        for (const item of items) {
          const reqQty = Number(item.quantity ?? 0);
          if (reqQty <= 0) continue;
          const pName = item.productName || item.productId || '';
          const pBatch = item.batchNo || null;
          if (!pName) continue;

          // Get warehouse remaining_quantity for this product+batch
          const batchRes = await query(
            `SELECT COALESCE(SUM(remaining_quantity), 0) AS available
             FROM stock_batches
             WHERE location = $1
               AND LOWER(TRIM(description)) = LOWER(TRIM($2))
               AND (COALESCE(batch_no,'') = COALESCE($3,'') OR $3 IS NULL)
               AND remaining_quantity > 0`,
            [fromLocation, pName, pBatch]
          );
          const available = Number(batchRes.rows?.[0]?.available ?? 0);

          // Get already-committed quantity from other in-flight transfers for same warehouse+product+batch
          const committedRes = await query(
            `SELECT COALESCE(SUM(sti.quantity), 0) AS committed
             FROM stock_transfer_items sti
             JOIN stock_transfers st ON st.id = sti.transfer_id
             WHERE st.from_warehouse = $1
               AND st.status = ANY($2::text[])
               AND LOWER(TRIM(sti.product_name)) = LOWER(TRIM($3))
               AND (COALESCE(sti.batch_no,'') = COALESCE($4,'') OR $4 IS NULL)`,
            [fromLocation, IN_FLIGHT_STATUSES, pName, pBatch]
          );
          const committed = Number(committedRes.rows?.[0]?.committed ?? 0);
          const netAvailable = available - committed;

          if (reqQty > netAvailable) {
            shortfalls.push(`${pName}${pBatch ? ` (batch ${pBatch})` : ''}: requested ${reqQty}, available ${Math.max(0, netAvailable)}`);
          }
        }
        if (shortfalls.length > 0) {
          return res.status(409).json({
            success: false,
            error: `Insufficient warehouse stock for dispatch. ${shortfalls.join('; ')}. Other in-flight dispatches may already be using this stock.`,
          });
        }
      }

      const transfer = await insert('stock_transfers', transferData);

      let finalItems = items;
      if (finalItems.length === 0 && productName && quantity > 0) {
        finalItems = [{ productId: productName, productName, quantity, unit: 'units', batchNo: null, metadata: null }];
      }
      await replaceTransferItems(transfer.id, finalItems, fromLocation);

      // ── Auto-approve small transfers (qty ≤ threshold) ──────────────────────
      // If the transfer total quantity is at or below the configured threshold,
      // skip GM approval entirely and advance straight to 'dispatched'.
      // Only applies to pending_approval transfers created by non-GM roles.
      const currentStatus = transfer.status || transferData.status || 'pending_approval';
      if (currentStatus === 'pending_approval' || currentStatus === 'pending') {
        const totalItemQty = finalItems.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
        const actorName = preparedByName || req.user?.fullName || req.user?.username || 'system';
        const autoApproved = await checkAutoApproveTransfer(
          transfer.id, totalItemQty, fromLocation, toLocation, actorName
        ).catch(() => false);
        if (autoApproved) {
          // Reload transfer so returned JSON reflects auto-dispatched status
          const refreshed = await getOne('SELECT * FROM stock_transfers WHERE id=$1', [transfer.id]);
          if (refreshed) Object.assign(transfer, refreshed);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      let dispatchNote = null;
      if (transfer.status === 'dispatched') {
        dispatchNote = await createDispatchNote(transfer, transfer.dispatched_by || transferData.created_by, body.dispatchMeta || {});
      }

      await publishRealtimeEvent('stock_transfers', 'create', transfer);
      broadcastStockEvent('transfer_created', { transferId: transfer.id, status: transfer.status })?.catch(() => {});

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

      // Strip any client-supplied approval-evidence fields — these are only ever written
      // server-side as a result of a verified GM action. Allowing clients to set them directly
      // would enable privilege escalation (forging GM approval state).
      delete updatePayload.gm_approved_at;
      delete updatePayload.gm_approved_by;
      delete updatePayload.gm_approved_by_id;
      delete updatePayload.gmApprovedAt;
      delete updatePayload.gmApprovedBy;
      delete updatePayload.gmApprovedById;
      delete updatePayload.prepared_by_id;
      delete updatePayload.prepared_by_role;
      delete updatePayload.preparedById;
      delete updatePayload.preparedByRole;

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
            // B3: A 'delivered' status means the branch confirmed clean receipt — stamp received_at/received_by too.
            updatePayload.received_at = body.receivedAt || updatePayload.received_at || nowIso;
            updatePayload.received_by =
              body.receivedBy || updatePayload.received_by || currentUser?.fullName || currentUser?.username || null;
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

      if ('gmAction' in updatePayload || 'gm_action' in updatePayload) {
        updatePayload.gm_action = updatePayload.gmAction !== undefined ? updatePayload.gmAction : updatePayload.gm_action;
        delete updatePayload.gmAction;
      }
      if ('gmComment' in updatePayload || 'gm_comment' in updatePayload) {
        updatePayload.gm_comment = updatePayload.gmComment !== undefined ? updatePayload.gmComment : updatePayload.gm_comment;
        delete updatePayload.gmComment;
      }
      if ('amendedByGm' in updatePayload || 'amended_by_gm' in updatePayload) {
        updatePayload.amended_by_gm = updatePayload.amendedByGm !== undefined ? updatePayload.amendedByGm : updatePayload.amended_by_gm;
        delete updatePayload.amendedByGm;
      }
      if (updatePayload.signatureName !== undefined) {
        updatePayload.signature_name = updatePayload.signatureName ?? updatePayload.signature_name ?? null;
        delete updatePayload.signatureName;
      }
      if (updatePayload.branchReceiptNote !== undefined) {
        updatePayload.branch_receipt_note = updatePayload.branchReceiptNote ?? updatePayload.branch_receipt_note ?? null;
        delete updatePayload.branchReceiptNote;
      }
      if (updatePayload.discrepancyFlag !== undefined || updatePayload.discrepancy_flag !== undefined) {
        updatePayload.discrepancy_flag = updatePayload.discrepancyFlag ?? updatePayload.discrepancy_flag ?? false;
        delete updatePayload.discrepancyFlag;
        // B5: Auto-generate a transfer-level discrepancy_note from per-item notes when flag is set.
        // Only overwrite if the client didn't send an explicit transfer-level note.
        if (updatePayload.discrepancy_flag && !updatePayload.discrepancy_note) {
          const rawItems = body.items || body.itemsArray || [];
          const discrepItems = Array.isArray(rawItems)
            ? rawItems.filter(it => it.discrepancyNote || it.discrepancy_note)
            : [];
          if (discrepItems.length > 0) {
            updatePayload.discrepancy_note = discrepItems
              .map(it => {
                const name = it.productName || it.product_name || it.productId || 'item';
                const note = it.discrepancyNote || it.discrepancy_note || '';
                const sent = it.quantitySent ?? it.quantity_approved ?? it.quantity ?? '';
                const rcvd = it.quantityReceived ?? it.quantity_received ?? '';
                return `${name}: dispatched ${sent}, received ${rcvd}${note ? ` — ${note}` : ''}`;
              })
              .join('; ');
          }
        }
      }
      if (updatePayload.receiptStatus !== undefined) {
        updatePayload.receipt_status = updatePayload.receiptStatus ?? updatePayload.receipt_status ?? null;
        delete updatePayload.receiptStatus;
      }

      // Set rejected_at timestamp when status transitions to rejected
      if ((updatePayload.status || body.status) === 'rejected' && !updatePayload.rejected_at) {
        updatePayload.rejected_at = new Date().toISOString();
        if (!updatePayload.rejected_by && !updatePayload.rejectedBy) {
          updatePayload.rejected_by = currentUser?.fullName || currentUser?.username || null;
        }
      }
      // Normalise camelCase → snake_case for reject fields
      if (updatePayload.rejectedBy !== undefined) {
        updatePayload.rejected_by = updatePayload.rejectedBy ?? updatePayload.rejected_by ?? null;
        delete updatePayload.rejectedBy;
      }

      const metaExtras = {};
      if (updatePayload.approved_by) { metaExtras.approved_by = updatePayload.approved_by; delete updatePayload.approved_by; }
      if (updatePayload.approvedBy) { metaExtras.approved_by = updatePayload.approvedBy; delete updatePayload.approvedBy; }

      const gmActionProvided = body.gmAction || body.gm_action || updatePayload.gm_action;
      const isGmApprovalAction = gmActionProvided === 'approve' || gmActionProvided === 'amend_approve';

      // Record GM approval timestamp and approver when a GM approval action is present.
      // These fields are written here server-side; they are stripped from updatePayload at the top so clients cannot forge them.
      if (isGmApprovalAction) {
        const gmName = metaExtras.approved_by || currentUser?.fullName || currentUser?.username || 'GM';
        const gmId = currentUser?.id || currentUser?.userId || null;
        updatePayload.gm_approved_at = new Date().toISOString();
        updatePayload.gm_approved_by = gmName;
        updatePayload.gm_approved_by_id = gmId;
      }

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

      const oldTransfer = await getOne('SELECT status, from_warehouse, to_branch, gm_action, gm_approved_by, prepared_by_id, created_by FROM stock_transfers WHERE id = $1', [id]);
      const previousStatus = oldTransfer?.status;

      // Hard gate: block ANY stock-advancing status transition without a prior or current GM approval.
      // Covers all statuses that represent stock in motion or completed: approved, dispatched, in_transit,
      // received, partially_received, delivered, completed.
      // The gate passes ONLY when: (a) a valid GM approval action is present in this request, OR
      // (b) the record already has a persisted GM approval (gm_approved_by set from a prior approval event).
      const targetStatus = updatePayload.status || body.status;
      const STOCK_ADVANCING_STATUSES = ['approved', 'dispatched', 'in_transit', 'received', 'partially_received', 'delivered', 'completed'];
      const ALREADY_PAST_GATE_STATUSES = ['approved', 'dispatched', 'in_transit', 'received', 'partially_received', 'delivered', 'completed'];
      const isStockAdvancingTransition = targetStatus &&
        STOCK_ADVANCING_STATUSES.includes(targetStatus) &&
        previousStatus !== targetStatus &&
        !ALREADY_PAST_GATE_STATUSES.includes(previousStatus || '');
      if (isStockAdvancingTransition && !isGmApprovalAction && !oldTransfer?.gm_approved_by) {
        return res.status(403).json({
          success: false,
          error: 'GM approval is required before this dispatch can proceed. A General Manager must approve this transfer before status can advance.',
        });
      }

      // Extra safety: non-approval GM actions (reject/return) MUST NOT be combined with stock-advancing status transitions.
      if (gmActionProvided && !isGmApprovalAction && targetStatus && STOCK_ADVANCING_STATUSES.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          error: `Cannot set status to '${targetStatus}' with GM action '${gmActionProvided}'. Only approve or amend_approve actions can advance a dispatch.`,
        });
      }

      // GM role enforcement (deny-by-default): only authenticated users with an explicitly allowed GM role
      // may execute gmAction. If user is not authenticated or role is missing/unrecognized, deny.
      const GM_ROLES = ['gm', 'general_manager', 'director', 'admin', 'super_admin'];
      if (gmActionProvided) {
        const userRole = (currentUser?.role || '').toLowerCase().trim();
        if (!userRole || !GM_ROLES.includes(userRole)) {
          return res.status(403).json({
            success: false,
            error: 'Only a General Manager or Director may approve, reject, or return dispatch requests.',
          });
        }
      }

      // ── #69 Idempotency guard: block duplicate receipt operations ─────────────
      // ── #70 Audit every blocked duplicate for ops visibility ──────────────────
      const RECEIPT_TERMINAL = new Set(['received', 'partially_received', 'delivered', 'completed']);
      if (targetStatus && RECEIPT_TERMINAL.has(targetStatus) && oldTransfer && RECEIPT_TERMINAL.has(oldTransfer.status)) {
        try {
          await query(
            `INSERT INTO stock_automation_log (id, automation_type, result_summary, branch_id, status, error_message, created_at)
             VALUES ($1,'duplicate_receipt_block',$2,$3,'error',$4,NOW())`,
            [
              `DAL-DUP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              `Blocked duplicate receipt on transfer ${id} — already '${oldTransfer.status}'`,
              oldTransfer.to_branch || 'unknown',
              `Actor: ${currentUser?.username || 'unknown'}; attempted status: ${targetStatus}`,
            ]
          );
        } catch {}
        return res.status(409).json({
          success: false,
          error: `Transfer ${id} has already been received (current status: ${oldTransfer.status}). Duplicate receipt blocked.`,
        });
      }

      // ── #71 Pre-deduction availability guard for approval-time FEFO deductions ──
      // Runs before the update so we can return a clean 422 without partial writes.
      // The CHECK constraints on stock_batches.remaining_quantity serve as the hard
      // database-level guard; this is a soft, user-friendly pre-check.
      if (targetStatus === 'approved' && previousStatus !== 'approved' && previousStatus !== 'dispatched') {
        const srcWh = oldTransfer?.from_warehouse || null;
        const isCtryToWh = srcWh === 'country_stock';
        const srcType = inferLocationType(srcWh) || 'warehouse';
        if (srcWh && !isCtryToWh && srcType !== 'branch') {
          const itemsToGuard = await getMany(
            `SELECT product_name, COALESCE(quantity_approved, quantity)::numeric AS qty
             FROM stock_transfer_items WHERE transfer_id = $1`,
            [id]
          );
          const guardShortfalls = [];
          for (const item of itemsToGuard) {
            const needed = Number(item.qty ?? 0);
            if (needed <= 0) continue;
            const pName = item.product_name || 'Unknown';
            const availRow = await getOne(
              `SELECT COALESCE(SUM(remaining_quantity), 0)::numeric AS avail
               FROM stock_batches
               WHERE location = $1
                 AND LOWER(TRIM(description)) = LOWER(TRIM($2))
                 AND remaining_quantity > 0`,
              [srcWh, pName]
            );
            const avail = Number(availRow?.avail ?? 0);
            if (needed > avail) {
              guardShortfalls.push(`${pName}: need ${needed}, available ${avail}`);
            }
          }
          if (guardShortfalls.length > 0) {
            return res.status(422).json({
              success: false,
              error: `Insufficient warehouse stock for GM approval. ${guardShortfalls.join('; ')}. Check stock levels or amend quantities before approving.`,
              shortfalls: guardShortfalls,
            });
          }
        }
      }

      const transfer = await update('stock_transfers', id, updatePayload, 'id');
      if (!transfer) {
        return res.status(404).json({ success: false, error: 'Transfer not found or was already modified by another user. Please refresh and try again.' });
      }

      // Notify the preparing user when GM amends a transfer
      if ((body.gmAction === 'amend_approve' || body.gm_action === 'amend_approve') && body.amendmentLog && Array.isArray(body.amendmentLog) && body.amendmentLog.length > 0) {
        try {
          const gmName = updatePayload.amended_by_gm || currentUser?.fullName || currentUser?.username || 'GM';
          const logSummary = body.amendmentLog.map(entry => {
            if (typeof entry === 'string') return entry;
            const product = entry.product || entry.productName || entry.product_name || '';
            const from = entry.from !== undefined ? entry.from : (entry.original !== undefined ? entry.original : null);
            const to = entry.to !== undefined ? entry.to : (entry.approved !== undefined ? entry.approved : null);
            if (product && from !== null && to !== null) return `${product}: ${from} → ${to}`;
            return entry.detail || entry.note || JSON.stringify(entry);
          }).join('; ');

          // Primary: look up the specific user who prepared the dispatch via prepared_by_id
          let preparerUser = null;
          if (oldTransfer?.prepared_by_id) {
            preparerUser = await getOne(
              `SELECT id, username, full_name, role FROM users WHERE id = $1 AND is_active = TRUE`,
              [oldTransfer.prepared_by_id]
            );
          }
          // Fallback: match by full_name / created_by against stock managers at the source warehouse
          if (!preparerUser && oldTransfer?.created_by) {
            const sourceWarehouse = transfer.from_warehouse || transfer.from_location || oldTransfer?.from_warehouse || null;
            if (sourceWarehouse) {
              preparerUser = await getOne(
                `SELECT id, username, full_name, role FROM users
                 WHERE is_active = TRUE
                   AND LOWER(role) = 'stock_manager'
                   AND LOWER(full_name) = LOWER($1)
                   AND (REPLACE(LOWER(branch), ' ', '_') = REPLACE(LOWER($2), ' ', '_')
                     OR EXISTS (
                       SELECT 1 FROM jsonb_array_elements_text(COALESCE(branches, '[]'::jsonb)) AS b
                       WHERE REPLACE(LOWER(b), ' ', '_') = REPLACE(LOWER($2), ' ', '_')
                     ))
                 LIMIT 1`,
                [oldTransfer.created_by, sourceWarehouse]
              );
            }
          }

          if (preparerUser) {
            const recipientId = (preparerUser.username || String(preparerUser.id)).toLowerCase().trim();
            await insert('notifications', {
              id: `NOTIF-AMD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              recipient_type: 'staff',
              recipient_id: recipientId,
              title: 'Transfer Amended by GM — Repack Required',
              message: `Transfer #${id} was amended by ${gmName} during approval. Please repack the shipment accordingly. Changes: ${logSummary}`,
              type: 'warning',
              reference_id: String(id),
              metadata: JSON.stringify({
                transfer_id: id,
                amended_by: gmName,
                source_warehouse: transfer.from_warehouse || transfer.from_location || oldTransfer?.from_warehouse || null,
                amendment_log: body.amendmentLog,
              }),
            });
          }
        } catch (notifErr) {
          console.error('Failed to create stock manager amendment notification:', notifErr);
        }
      }

      if (body.items !== undefined || body.itemsArray !== undefined) {
        const normalizedItems = parseItems(body.items || body.itemsArray, true);
        const patchSourceLocation = body.fromWarehouse || body.from_warehouse || body.fromLocation || body.from_location || null;
        await replaceTransferItems(id, normalizedItems, patchSourceLocation);
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
              const qty = Number(item.quantity_approved ?? item.quantity ?? 0);
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
              const rcvDstType = (destWarehouse || '').includes('warehouse') ? 'warehouse' : 'branch';
              await client.query(
                `INSERT INTO stock_movements (id, product_name, batch_no, expiry_date, quantity, movement_type, source_location, source_location_type, destination_location, destination_location_type, reference_id, notes, created_by, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'transfer_in', 'country_stock', 'country', $6, $7, $8, $9, $10, 'posted', NOW(), NOW())`,
                [movId, productName, batchNo || null, expiryDate || null, qty, destWarehouse || 'warehouse', rcvDstType, id,
                 `Received from Country Stock — transfer ${id}`, actorName]
              );
            }
          }

          if (transfer.status === 'approved' && previousStatus !== 'approved' && previousStatus !== 'dispatched') {
            const sourceWarehouse = transfer.from_warehouse || null;
            // Country→Warehouse dispatches: receive-stock.js handles ALL physical stock
            // movements (FIFO deduction + stock_batches creation + stock_movements) when
            // the warehouse accepts.  Deducting here would cause a double deduction.
            // Only apply the approval reservation for warehouse→branch and branch→branch transfers.
            const isCountryToWarehouse = sourceWarehouse === 'country_stock';
            const aprSrcType = inferLocationType(sourceWarehouse) || 'warehouse';
            if (sourceWarehouse && !isCountryToWarehouse) {
              for (const item of transferItems) {
                const qtyToReserve = Number(item.quantity_approved ?? item.quantity ?? 0);
                if (qtyToReserve <= 0) continue;
                const productName = item.product_name || item.product_id || 'Unknown';
                const normalizedSrc = normalizeBranchSlug(sourceWarehouse) || sourceWarehouse;

                // Physically reserve from source — deduct the right table depending on source type.
                if (aprSrcType === 'branch') {
                  const deducted = await fefoDeductBranchInventoryBatches(client, normalizedSrc, productName, qtyToReserve);
                  if (deducted < qtyToReserve) {
                    console.warn(`[transfers] approval shortfall: ${productName} at ${normalizedSrc} — requested ${qtyToReserve}, deducted ${deducted}. Transfer approved with partial stock.`);
                  }
                } else {
                  await fefoDeductStockBatches(client, sourceWarehouse, productName, qtyToReserve);
                  await fefoDeductWarehouseInventory(client, sourceWarehouse, productName, qtyToReserve);
                }

                const batchNo = item.batch_no || null;
                const expiryDate = item.expiry_date || null;
                const movId = `MOV-APR-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
                await client.query(
                  `INSERT INTO stock_movements (id, product_name, batch_no, expiry_date, quantity, movement_type, source_location, source_location_type, destination_location, destination_location_type, reference_id, notes, created_by, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, 'reserved', $6, $7, $8, 'branch', $9, $10, $11, 'posted', NOW(), NOW())`,
                  [movId, productName, batchNo, expiryDate, qtyToReserve, sourceWarehouse, aprSrcType, transfer.to_branch || 'branch', id,
                   `GM approved — stock reserved for ${transfer.to_branch || 'branch'} — transfer ${id}`, actorName]
                );
              }
            }
          }

          if (transfer.status === 'dispatched' && previousStatus !== 'dispatched') {
            const sourceWarehouse = transfer.from_warehouse || null;
            const alreadyDeducted = previousStatus === 'approved';
            const dspSrcType = inferLocationType(sourceWarehouse) || 'warehouse';
            for (const item of transferItems) {
              const qty = Number(item.quantity_approved ?? item.quantity ?? 0);
              if (qty <= 0) continue;
              const productName = item.product_name || item.product_id || 'Unknown';

              if (!alreadyDeducted && sourceWarehouse) {
                const normalizedSrc = normalizeBranchSlug(sourceWarehouse) || sourceWarehouse;
                if (dspSrcType === 'branch') {
                  const deducted = await fefoDeductBranchInventoryBatches(client, normalizedSrc, productName, qty);
                  if (deducted < qty) {
                    console.warn(`[transfers] dispatch shortfall: ${productName} at ${normalizedSrc} — requested ${qty}, deducted ${deducted}. Dispatched with partial stock.`);
                  }
                } else {
                  await fefoDeductStockBatches(client, sourceWarehouse, productName, qty);
                  await fefoDeductWarehouseInventory(client, sourceWarehouse, productName, qty);
                }
              }

              const batchNo = item.batch_no || null;
              const expiryDate = item.expiry_date || null;
              const movId = `MOV-DSP-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO stock_movements (id, product_name, batch_no, expiry_date, quantity, movement_type, source_location, source_location_type, destination_location, destination_location_type, reference_id, notes, created_by, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'transfer_out', $6, $7, $8, 'branch', $9, $10, $11, 'posted', NOW(), NOW())`,
                [movId, productName, batchNo, expiryDate, qty, sourceWarehouse || 'warehouse', dspSrcType, transfer.to_branch || 'branch', id,
                 `Dispatched to ${transfer.to_branch || 'branch'} — transfer ${id}`, actorName]
              );
            }

            // ── #62 Stamp batch snapshot into transfer metadata at dispatch time ──────
            // Captures the exact batch/expiry at the moment of physical dispatch so the
            // Dispatch Note can always show accurate batch data even after stock_batches changes.
            try {
              const batchSnapshot = transferItems.map(it => ({
                productName: it.product_name || it.product_id || 'Unknown',
                batchNo: it.batch_no || null,
                expiryDate: it.expiry_date || null,
                qty: Number(it.quantity_approved ?? it.quantity ?? 0),
                unit: it.unit || 'units',
              }));
              await client.query(
                `UPDATE stock_transfers
                 SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify({ batchSnapshot, batchSnapshotAt: new Date().toISOString() }), id]
              );
            } catch {}
          }

          // ── #2: Cancelled/Rejected Transfer — Restore Reserved Stock ──────────────
          // When a transfer is cancelled or rejected AFTER being approved, the
          // stock_batches.dispatched_quantity was already incremented during approval.
          // We must restore it here to avoid phantom reservation locks.
          if (
            (transfer.status === 'cancelled' || transfer.status === 'rejected') &&
            (previousStatus === 'approved' || previousStatus === 'dispatched')
          ) {
            const sourceWarehouse = oldTransfer?.from_warehouse || null;
            const isCountryToWarehouse = sourceWarehouse === 'country_stock';
            const cancSrcType = inferLocationType(sourceWarehouse) || 'warehouse';

            if (sourceWarehouse && !isCountryToWarehouse) {
              for (const item of transferItems) {
                const qty = Number(item.quantity_approved ?? item.quantity ?? 0);
                if (qty <= 0) continue;
                const productName = item.product_name || 'Unknown';

                if (cancSrcType === 'branch') {
                  // Restore branch_inventory_batches
                  const batchNo = item.batch_no || null;
                  const expiryDate = item.expiry_date || null;
                  if (batchNo && expiryDate) {
                    const restoreBibId = `BIB-RST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    await client.query(
                      `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,$5::date,$6,'in_stock',NOW(),NOW())
                       ON CONFLICT (branch_id, product_name, batch_no, expiry_date)
                       DO UPDATE SET quantity = branch_inventory_batches.quantity + EXCLUDED.quantity, updated_at=NOW()`,
                      [restoreBibId, sourceWarehouse, productName, batchNo, expiryDate, qty]
                    );
                  }
                } else {
                  // Restore stock_batches (warehouse): reverse FEFO deduction in same order
                  let rem = qty;
                  const batchesToRestore = await client.query(
                    `SELECT id, dispatched_quantity FROM stock_batches
                     WHERE (location=$1 OR warehouse_id=$1)
                       AND LOWER(TRIM(description))=LOWER(TRIM($2))
                       AND dispatched_quantity > 0
                     ORDER BY expiry_date ASC NULLS LAST FOR UPDATE`,
                    [sourceWarehouse, productName]
                  );
                  for (const b of batchesToRestore.rows) {
                    if (rem <= 0) break;
                    const restore = Math.min(rem, Number(b.dispatched_quantity));
                    await client.query(
                      `UPDATE stock_batches
                       SET remaining_quantity = remaining_quantity + $1,
                           dispatched_quantity = GREATEST(dispatched_quantity - $1, 0),
                           updated_at = NOW()
                       WHERE id=$2`,
                      [restore, b.id]
                    );
                    rem -= restore;
                  }

                  // Restore warehouse_inventory quantity
                  await client.query(
                    `UPDATE warehouse_inventory
                     SET quantity = quantity + $1, updated_at=NOW()
                     WHERE warehouse_id=$2 AND LOWER(TRIM(product_name))=LOWER(TRIM($3))`,
                    [qty, sourceWarehouse, productName]
                  );
                }
              }

              // Void the 'reserved' stock_movements written at approval time
              await client.query(
                `UPDATE stock_movements SET status='cancelled', updated_at=NOW()
                 WHERE reference_id=$1 AND movement_type='reserved' AND status='posted'`,
                [id]
              );

              console.log(`[transfers] stock reservation restored for ${transfer.status} transfer ${id} (was ${previousStatus})`);
            }
          }
          // ── End cancel/reject stock restore ──────────────────────────────────────

          // Guard: only write branch inventory on the FIRST receipt event.
          // Covers both the BranchPortal path (delivered/partially_received) and the
          // confirm-receipt.js barcode path (received).  If any prior receipt status is
          // already set, skip to prevent double-counting in branch_inventory_batches.
          const PRIOR_RECEIPT_STATUSES = new Set(['received', 'delivered', 'partially_received', 'completed']);
          const isFirstReceipt = !PRIOR_RECEIPT_STATUSES.has(previousStatus || '');
          if (
            (transfer.status === 'delivered' || transfer.status === 'partially_received') &&
            isFirstReceipt
          ) {
            // Normalize branch ID: transfer.to_branch can be a display name (e.g. "Oshakati Branch")
            // but branch_inventory_batches / inventory_balances use the canonical slug.
            const branchId = normalizeBranchSlug(transfer.to_branch) || transfer.to_branch || null;
            const sourceWarehouse = transfer.from_warehouse || null;
            for (const item of transferItems) {
              // B2: Fall back to quantity_approved (GM-approved qty) before the original request qty.
              const qtyReceived = Number(item.quantity_received ?? item.quantity_approved ?? item.quantity ?? 0);
              if (qtyReceived <= 0) continue;
              const productName = item.product_name || item.product_id || 'Unknown';
              const batchNo = item.batch_no || null;
              const expiryDate = item.expiry_date || null;

              // Look up unit price from the source warehouse batch
              const priceRow = await client.query(
                `SELECT COALESCE(dpc_unit_value, 0) AS unit_price
                   FROM stock_batches
                  WHERE location = $1 AND description ILIKE $2
                    AND ($3::text IS NULL OR batch_no = $3)
                  ORDER BY created_at DESC LIMIT 1`,
                [sourceWarehouse, productName, batchNo]
              );
              const unitPrice = Number(priceRow.rows[0]?.unit_price || 0);

              const batchId = `BIB-${id.slice(-6)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              if (batchNo !== null && batchNo !== undefined && expiryDate !== null && expiryDate !== undefined) {
                await client.query(
                  `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price, source_warehouse, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, 'in_stock', NOW(), NOW())
                   ON CONFLICT (branch_id, product_name, batch_no, expiry_date) DO UPDATE
                     SET quantity = branch_inventory_batches.quantity + EXCLUDED.quantity,
                         unit_price = COALESCE(EXCLUDED.unit_price, branch_inventory_batches.unit_price),
                         source_warehouse = COALESCE(EXCLUDED.source_warehouse, branch_inventory_batches.source_warehouse),
                         updated_at = NOW()`,
                  [batchId, branchId, productName, batchNo, expiryDate, qtyReceived, unitPrice || null, sourceWarehouse]
                );
              } else {
                // No batch_no/expiry_date — ON CONFLICT won't fire for NULLs; use a safe
                // SELECT-for-update then update-or-insert within the same transaction.
                const existingBranch = await client.query(
                  `SELECT id FROM branch_inventory_batches
                   WHERE branch_id = $1 AND product_name = $2
                     AND batch_no IS NOT DISTINCT FROM $3
                     AND expiry_date IS NOT DISTINCT FROM $4
                   FOR UPDATE`,
                  [branchId, productName, batchNo || null, expiryDate || null]
                );
                if (existingBranch.rows.length > 0) {
                  await client.query(
                    `UPDATE branch_inventory_batches
                        SET quantity = quantity + $1,
                            unit_price = COALESCE($2, unit_price),
                            source_warehouse = COALESCE($3, source_warehouse),
                            updated_at = NOW()
                      WHERE id = $4`,
                    [qtyReceived, unitPrice || null, sourceWarehouse, existingBranch.rows[0].id]
                  );
                } else {
                  await client.query(
                    `INSERT INTO branch_inventory_batches (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price, source_warehouse, status, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'in_stock', NOW(), NOW())`,
                    [batchId, branchId, productName, batchNo || null, expiryDate || null, qtyReceived, unitPrice || null, sourceWarehouse]
                  );
                }
              }

              const bimId = `BIM-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              await client.query(
                `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
                 VALUES ($1, $2, 'receive', $3, $4, $5, $6, $7, $8, NOW())`,
                [bimId, branchId, productName, batchNo, qtyReceived, id,
                 `Received from warehouse — transfer ${id}${item.discrepancy_note ? ` (${item.discrepancy_note})` : ''}`, actorName]
              );

              const movId = `MOV-BRC-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
              // B1: Use inferLocationType() — string-contains check would mislabel branch-sourced transfers.
              const srcLocType = inferLocationType(transfer.from_warehouse) || 'warehouse';
              await client.query(
                `INSERT INTO stock_movements (id, product_name, batch_no, expiry_date, quantity, movement_type, source_location, source_location_type, destination_location, destination_location_type, reference_id, notes, created_by, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'transfer_in', $6, $7, $8, 'branch', $9, $10, $11, 'posted', NOW(), NOW())`,
                [movId, productName, batchNo, expiryDate, qtyReceived,
                 transfer.from_warehouse || 'warehouse', srcLocType,
                 branchId || 'branch', id,
                 `Branch received from warehouse — transfer ${id}`, actorName]
              );
            }
          }
        });

        // Recompute inventory_balances for affected locations after status change
        if (statusChanged) {
          const srcWarehouse = transfer.from_warehouse;
          const dstBranch = transfer.to_branch;
          if (['dispatched', 'approved'].includes(transfer.status) && srcWarehouse) {
            const srcLocType = inferLocationType(srcWarehouse) || 'warehouse';
            const normalizedSrc = srcLocType === 'branch'
              ? (normalizeBranchSlug(srcWarehouse) || srcWarehouse)
              : srcWarehouse;
            recomputeLocationBalances(srcLocType, normalizedSrc).catch(e =>
              console.error('[stockEngine] transfer dispatch recompute error:', e.message)
            );
          }
          if (['delivered', 'partially_received', 'received'].includes(transfer.status) && dstBranch) {
            const normalizedDstBranch = normalizeBranchSlug(dstBranch) || dstBranch;
            recomputeLocationBalances('branch', normalizedDstBranch).catch(e =>
              console.error('[stockEngine] transfer receipt recompute error:', e.message)
            );
          }
        }
      }

      let dispatchNote = null;
      if (transfer.status === 'dispatched') {
        dispatchNote = await createDispatchNote(transfer, transfer.dispatched_by, body.dispatchMeta || {});
      }
      // B4: Mark dispatch note as received for all terminal-receipt statuses.
      // BranchPortal uses 'delivered' for clean receipts and 'partially_received' for
      // discrepant ones — 'received' is only used by direct API callers. All three must
      // close the dispatch note so it doesn't remain open indefinitely.
      if (['received', 'delivered', 'partially_received'].includes(transfer.status)) {
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
      broadcastStockEvent('transfer_updated', { transferId: transfer.id, status: transfer.status })?.catch(() => {});

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
      broadcastStockEvent('transfer_deleted', { transferId: id })?.catch(() => {});
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock transfers API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}


