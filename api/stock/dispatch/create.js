/**
 * POST /api/stock/dispatch/create
 * Create a warehouse dispatch to a branch. Enforces batch + expiry per item.
 * Captures preparer identity from authenticated session, snapshots destination branch staff,
 * and sets status to 'pending_approval' — consistent with the transfers endpoint.
 */
import { query, getOne, getMany } from '../../db.js';
import { recomputeInventoryBalance } from '../../services/stockEngine.js';

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
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const body = await parseBody(req);
  const currentUser = req.user || null;

  const { sourceWarehouseId, destinationBranchId, items, preparedBy, notes } = body;

  if (!sourceWarehouseId) return res.status(400).json({ success: false, error: 'sourceWarehouseId is required' });
  if (!destinationBranchId) return res.status(400).json({ success: false, error: 'destinationBranchId is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

  // Validate all items: batch + expiry + available stock
  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.batchNo || !String(item.batchNo).trim()) {
      validationErrors.push(`Item ${i + 1} (${item.productName || item.productId || 'unknown'}): batchNo is required`);
    }
    if (!item.expiryDate || !String(item.expiryDate).trim()) {
      validationErrors.push(`Item ${i + 1} (${item.productName || item.productId || 'unknown'}): expiryDate is required`);
    }
    if (!item.quantity || Number(item.quantity) <= 0) {
      validationErrors.push(`Item ${i + 1}: quantity must be > 0`);
    }
  }
  if (validationErrors.length > 0) {
    return res.status(422).json({ success: false, error: 'Dispatch validation failed', validationErrors });
  }

  // Check stock availability. Primary source: stock_batches.remaining_quantity (authoritative physical stock).
  // Fallback 1: inventory_balances (movement-derived cache). Fallback 2: stock_movements net.
  const stockErrors = [];
  for (const item of items) {
    const productName = (item.productName || item.product_name || '').trim();
    if (!productName) continue;
    const batchNo = (item.batchNo || '').trim();

    // Primary: stock_batches.remaining_quantity — the most reliable physical stock figure
    const batchRow = await getOne(
      `SELECT COALESCE(SUM(remaining_quantity), 0) AS qty
       FROM stock_batches
       WHERE LOWER(TRIM(location)) = LOWER(TRIM($1))
         AND LOWER(TRIM(description)) = LOWER(TRIM($2))
         AND COALESCE(batch_no, '') = $3
         AND status != 'expired'`,
      [sourceWarehouseId, productName, batchNo]
    );
    let availQty = Number(batchRow?.qty || 0);

    // Fallback 1: inventory_balances
    if (availQty <= 0) {
      const ibRow = await getOne(
        `SELECT COALESCE(closing_qty, 0) AS qty FROM inventory_balances
         WHERE location_type = 'warehouse'
           AND LOWER(TRIM(location_id)) = LOWER(TRIM($1))
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
           AND COALESCE(batch_no, '') = $3`,
        [sourceWarehouseId, productName, batchNo]
      );
      availQty = Number(ibRow?.qty || 0);
    }

    // Fallback 2: derive from stock_movements net
    if (availQty <= 0) {
      const INWARD_TYPES = ['supplier_import_receipt', 'warehouse_receipt', 'branch_receipt', 'transfer_in', 'received', 'return_in', 'positive_adjustment'];
      const OUTWARD_TYPES = ['warehouse_dispatch', 'transfer_out', 'reserved', 'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'online_order_fulfilment', 'prescription_dispense', 'write_off', 'return_out', 'negative_adjustment', 'sale', 'field_use'];
      const movements = await getMany(
        `SELECT movement_type, quantity, source_location, destination_location
         FROM stock_movements
         WHERE status = 'posted'
           AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
           AND COALESCE(batch_no, '') = $2`,
        [productName, batchNo]
      );
      const normalizedWarehouse = sourceWarehouseId.trim().toLowerCase();
      let inward = 0, outward = 0;
      for (const m of movements) {
        const dst = (m.destination_location || '').trim().toLowerCase();
        const src = (m.source_location || '').trim().toLowerCase();
        if (dst === normalizedWarehouse && INWARD_TYPES.includes(m.movement_type)) inward += Number(m.quantity || 0);
        if (src === normalizedWarehouse && OUTWARD_TYPES.includes(m.movement_type)) outward += Number(m.quantity || 0);
      }
      const movementsNet = inward - outward;
      if (movementsNet > 0) {
        console.warn(`[dispatch/create] stock_batches empty for ${productName}/${batchNo} at ${sourceWarehouseId}; falling back to movements net (${movementsNet}). Recomputing.`);
        recomputeInventoryBalance({
          locationType: 'warehouse',
          locationId: sourceWarehouseId,
          productName,
          batchNo,
          expiryDate: item.expiryDate || item.expiry_date || null,
        }).catch(e => console.error('[dispatch/create] recompute error:', e.message));
        availQty = movementsNet;
      }
    }

    if (availQty < Number(item.quantity)) {
      stockErrors.push(`${productName} batch ${batchNo}: requested ${item.quantity}, available ${availQty}`);
    }
  }
  if (stockErrors.length > 0) {
    return res.status(409).json({ success: false, error: 'Insufficient stock for dispatch', stockErrors });
  }

  // Capture preparer identity from authenticated session.
  // Name falls back to session-provided identity only; body.preparedBy is not used for security-sensitive fields.
  const preparedById = currentUser?.id || currentUser?.userId || null;
  const preparedByRole = currentUser?.role || null;
  const preparedByName = currentUser?.fullName || currentUser?.username || null;

  // Snapshot destination branch staff at dispatch creation time.
  let destinationBranchStaff = null;
  try {
    const branchStaff = await getMany(
      `SELECT id, full_name, role, branch, email, phone FROM users
       WHERE is_active = TRUE
         AND LOWER(role) = 'dispenser'
         AND (REPLACE(LOWER(branch), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(branches) = 'array' THEN branches ELSE '[]'::jsonb END
                ) AS b WHERE REPLACE(LOWER(b), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
              ))
       ORDER BY full_name`,
      [destinationBranchId]
    );
    if (branchStaff.length > 0) {
      destinationBranchStaff = branchStaff.map(u => ({
        id: u.id,
        name: u.full_name,
        role: u.role,
        phone: u.phone || null,
        email: u.email || null,
      }));
    }
  } catch (e) {
    console.warn('[dispatch/create] Could not snapshot destination branch staff:', e.message);
  }

  // Create a stock_transfer record with 'pending_approval' status (consistent with transfers endpoint).
  const ts = Date.now();
  const dispatchId = `DISP-${ts}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  await query(
    `INSERT INTO stock_transfers
       (id, from_warehouse, to_branch, dispatch_notes, status,
        created_by, prepared_by_id, prepared_by_role,
        destination_branch_staff,
        created_at, updated_at, metadata)
     VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6, $7, $8, NOW(), NOW(), $9)`,
    [
      dispatchId,
      sourceWarehouseId,
      destinationBranchId,
      notes || `Dispatch from ${sourceWarehouseId}`,
      preparedByName,
      preparedById,
      preparedByRole,
      destinationBranchStaff ? JSON.stringify(destinationBranchStaff) : null,
      JSON.stringify({ sourceWarehouseId, destinationBranchId, items }),
    ]
  );

  return res.status(201).json({
    success: true,
    dispatchId,
    sourceWarehouseId,
    destinationBranchId,
    itemsCount: items.length,
    status: 'pending_approval',
    message: `Dispatch ${dispatchId} created and awaiting GM approval. Items have batch and expiry validated.`,
  });
}
