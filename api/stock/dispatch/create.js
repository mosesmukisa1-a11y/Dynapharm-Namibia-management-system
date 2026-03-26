/**
 * POST /api/stock/dispatch/create
 * Create a warehouse dispatch to a branch. Enforces batch + expiry per item.
 * Captures preparer identity from authenticated session, snapshots destination branch staff,
 * and sets status to 'pending_approval' — consistent with the transfers endpoint.
 */
import { query, getOne, getMany } from '../../db.js';

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

  // Check stock availability for each batch
  const stockErrors = [];
  for (const item of items) {
    const productName = item.productName || item.product_name || '';
    if (!productName) continue;
    const available = await getOne(
      `SELECT COALESCE(closing_qty, 0) as qty FROM inventory_balances
       WHERE location_type = 'warehouse' AND location_id = $1
         AND product_name = $2 AND batch_no = $3`,
      [sourceWarehouseId, productName, item.batchNo]
    );
    const availQty = Number(available?.qty || 0);
    if (availQty < Number(item.quantity)) {
      stockErrors.push(`${productName} batch ${item.batchNo}: requested ${item.quantity}, available ${availQty}`);
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
         AND (REPLACE(LOWER(branch), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(
                  CASE WHEN jsonb_typeof(branches) = 'array' THEN branches ELSE '[]'::jsonb END
                ) AS b WHERE REPLACE(LOWER(b), ' ', '_') = REPLACE(LOWER($1), ' ', '_')
              ))
       ORDER BY role, full_name`,
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
