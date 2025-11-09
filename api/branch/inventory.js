import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toSqlDate(value) {
  if (!value) return null;
  const normalized = value.length === 7 ? `${value}-01` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
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

function normalizeInventoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    productName: row.product_name,
    productCode: row.product_code,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date ? row.expiry_date.toISOString().slice(0, 10) : null,
    quantity: parseNumber(row.quantity),
    unit: row.unit || 'units',
    unitPrice: row.unit_price !== null ? Number(row.unit_price) : null,
    status: row.status || (parseNumber(row.quantity) > 0 ? 'in_stock' : 'out_of_stock'),
    metadata: typeof row.metadata === 'object' ? row.metadata : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function normalizeMovementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    type: row.type,
    productName: row.product_name,
    productCode: row.product_code,
    batchNo: row.batch_no,
    quantity: parseNumber(row.quantity),
    unit: row.unit || 'units',
    sourceBranchId: row.source_branch_id,
    destinationBranchId: row.destination_branch_id,
    relatedBatchId: row.related_batch_id,
    reference: row.reference,
    notes: row.notes,
    metadata: typeof row.metadata === 'object' ? row.metadata : null,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function getInventoryByBranch(branchId) {
  const rows = await getMany(
    `SELECT * FROM branch_inventory_batches WHERE branch_id = $1 ORDER BY product_name ASC, expiry_date ASC NULLS LAST`,
    [branchId]
  );
  return rows.map(normalizeInventoryRow).filter(Boolean);
}

async function getMovementsByBranch(branchId, limit = 100) {
  const rows = await getMany(
    `SELECT * FROM branch_inventory_movements WHERE branch_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [branchId, limit]
  );
  return rows.map(normalizeMovementRow).filter(Boolean);
}

async function upsertInventoryBatch(client, payload) {
  const {
    id = generateId('BATCH'),
    branchId,
    productName,
    productCode = null,
    batchNo = '',
    expiryDate = null,
    quantity = 0,
    unit = 'units',
    unitPrice = null,
    status = null,
    metadata = null,
  } = payload;

  const expirySqlDate = toSqlDate(expiryDate);
  const computedStatus = status || (parseNumber(quantity) > 0 ? 'in_stock' : 'out_of_stock');

  const result = await client.query(
    `
      INSERT INTO branch_inventory_batches (id, branch_id, product_name, product_code, batch_no, expiry_date, quantity, unit, unit_price, status, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()), NOW())
      ON CONFLICT (branch_id, product_name, batch_no, expiry_date)
      DO UPDATE SET
        quantity = branch_inventory_batches.quantity + EXCLUDED.quantity,
        unit_price = COALESCE(EXCLUDED.unit_price, branch_inventory_batches.unit_price),
        unit = COALESCE(EXCLUDED.unit, branch_inventory_batches.unit),
        status = EXCLUDED.status,
        metadata = COALESCE(EXCLUDED.metadata, branch_inventory_batches.metadata),
        updated_at = NOW()
      RETURNING *;
    `,
    [
      id,
      branchId,
      productName,
      productCode,
      batchNo || null,
      expirySqlDate,
      parseNumber(quantity),
      unit,
      unitPrice !== null ? parseNumber(unitPrice) : null,
      computedStatus,
      metadata ? JSON.stringify(metadata) : null,
      parseDate(payload.createdAt || payload.created_at || null),
    ]
  );

  return normalizeInventoryRow(result.rows[0]);
}

async function setInventoryQuantity(client, batchRow, quantity) {
  const status = parseNumber(quantity) > 0 ? 'in_stock' : 'out_of_stock';
  const result = await client.query(
    `
      UPDATE branch_inventory_batches
      SET quantity = $1, status = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `,
    [parseNumber(quantity), status, batchRow.id]
  );
  return normalizeInventoryRow(result.rows[0]);
}

async function recordMovement(client, payload) {
  const movement = {
    id: payload.id || generateId('MOVE'),
    branch_id: payload.branchId,
    type: payload.type,
    product_name: payload.productName,
    product_code: payload.productCode || null,
    batch_no: payload.batchNo || null,
    quantity: parseNumber(payload.quantity),
    unit: payload.unit || 'units',
    source_branch_id: payload.sourceBranchId || null,
    destination_branch_id: payload.destinationBranchId || null,
    related_batch_id: payload.relatedBatchId || null,
    reference: payload.reference || null,
    notes: payload.notes || null,
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    created_by: payload.createdBy || null,
    created_at: parseDate(payload.createdAt || null) || new Date().toISOString(),
  };

  const result = await client.query(
    `
      INSERT INTO branch_inventory_movements
        (id, branch_id, type, product_name, product_code, batch_no, quantity, unit, source_branch_id, destination_branch_id, related_batch_id, reference, notes, metadata, created_by, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *;
    `,
    [
      movement.id,
      movement.branch_id,
      movement.type,
      movement.product_name,
      movement.product_code,
      movement.batch_no,
      movement.quantity,
      movement.unit,
      movement.source_branch_id,
      movement.destination_branch_id,
      movement.related_batch_id,
      movement.reference,
      movement.notes,
      movement.metadata,
      movement.created_by,
      movement.created_at,
    ]
  );

  return normalizeMovementRow(result.rows[0]);
}

async function handleReceive(body, currentUser) {
  const {
    branchId,
    productName,
    productCode = null,
    batchNo,
    expiryDate = null,
    quantity,
    unit = 'units',
    unitPrice = null,
    source = null,
    notes = null,
    metadata = null,
  } = body;

  if (!branchId || !productName || !batchNo) {
    throw new Error('branchId, productName and batchNo are required');
  }

  const createdBy = currentUser?.fullName || currentUser?.username || body.createdBy || null;

  const result = await withTransaction(async (client) => {
    const batch = await upsertInventoryBatch(client, {
      branchId,
      productName,
      productCode,
      batchNo,
      expiryDate,
      quantity,
      unit,
      unitPrice,
      metadata,
    });

    const movement = await recordMovement(client, {
      branchId,
      type: 'receive',
      productName,
      productCode,
      batchNo,
      quantity,
      unit,
      destinationBranchId: branchId,
      sourceBranchId: source || null,
      notes,
      metadata,
      relatedBatchId: batch.id,
      createdBy,
    });

    const inventory = await getInventoryByBranch(branchId);
    return { inventory, movement };
  });

  return result;
}

async function handleTransfer(body, currentUser) {
  const {
    fromBranchId,
    toBranchId,
    productName,
    productCode = null,
    batchNo,
    expiryDate = null,
    quantity,
    unit = 'units',
    notes = null,
    metadata = null,
  } = body;

  if (!fromBranchId || !toBranchId || !productName || !batchNo) {
    throw new Error('fromBranchId, toBranchId, productName and batchNo are required');
  }

  const createdBy = currentUser?.fullName || currentUser?.username || body.createdBy || null;

  const result = await withTransaction(async (client) => {
    // Fetch source batch
    const sourceRow = await getOne(
      'SELECT * FROM branch_inventory_batches WHERE branch_id = $1 AND product_name = $2 AND batch_no = $3 AND (expiry_date IS NOT DISTINCT FROM $4)',
      [fromBranchId, productName, batchNo, toSqlDate(expiryDate)]
    );

    if (!sourceRow) {
      throw new Error('Source batch not found');
    }

    if (parseNumber(sourceRow.quantity) < parseNumber(quantity)) {
      throw new Error('Insufficient stock for transfer');
    }

    // Decrease quantity from source
    const updatedSource = await setInventoryQuantity(client, sourceRow, parseNumber(sourceRow.quantity) - parseNumber(quantity));

    // Add to destination
    const destBatch = await upsertInventoryBatch(client, {
      branchId: toBranchId,
      productName,
      productCode,
      batchNo,
      expiryDate,
      quantity,
      unit,
      unitPrice: sourceRow.unit_price,
      metadata,
    });

    // Record movements for both branches
    const movementOut = await recordMovement(client, {
      branchId: fromBranchId,
      type: 'transfer_out',
      productName,
      productCode,
      batchNo,
      quantity,
      unit,
      destinationBranchId: toBranchId,
      notes,
      metadata,
      relatedBatchId: updatedSource.id,
      createdBy,
    });

    const movementIn = await recordMovement(client, {
      branchId: toBranchId,
      type: 'transfer_in',
      productName,
      productCode,
      batchNo,
      quantity,
      unit,
      sourceBranchId: fromBranchId,
      notes,
      metadata,
      relatedBatchId: destBatch.id,
      createdBy,
    });

    const inventory = await getInventoryByBranch(fromBranchId);
    return { inventory, movements: [movementOut, movementIn] };
  });

  return result;
}

async function handleAdjustment(body, currentUser) {
  const {
    branchId,
    productName,
    batchNo,
    expiryDate = null,
    quantity,
    unit = 'units',
    notes = null,
    metadata = null,
  } = body;

  if (!branchId || !productName || !batchNo || quantity === undefined || quantity === null) {
    throw new Error('branchId, productName, batchNo and quantity are required');
  }

  const createdBy = currentUser?.fullName || currentUser?.username || body.createdBy || null;

  const result = await withTransaction(async (client) => {
    const existing = await getOne(
      'SELECT * FROM branch_inventory_batches WHERE branch_id = $1 AND product_name = $2 AND batch_no = $3 AND (expiry_date IS NOT DISTINCT FROM $4)',
      [branchId, productName, batchNo, toSqlDate(expiryDate)]
    );

    if (!existing) {
      throw new Error('Inventory batch not found');
    }

    const updated = await setInventoryQuantity(client, existing, parseNumber(quantity));

    const movement = await recordMovement(client, {
      branchId,
      type: 'adjustment',
      productName,
      productCode: existing.product_code,
      batchNo,
      quantity: parseNumber(quantity) - parseNumber(existing.quantity),
      unit,
      notes,
      metadata,
      relatedBatchId: updated.id,
      createdBy,
    });

    const inventory = await getInventoryByBranch(branchId);
    return { inventory, movement };
  });

  return result;
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
      const branchId = searchParams.get('branch');
      if (!branchId) {
        return res.status(400).json({ success: false, error: 'branch parameter is required' });
      }
      const includeMovements = searchParams.get('includeMovements') === '1' || searchParams.get('include_movements') === '1';
      const inventory = await getInventoryByBranch(branchId);
      const response = {
        success: true,
        inventory,
      };
      if (includeMovements) {
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        response.movements = await getMovementsByBranch(branchId, Number.isNaN(limit) ? 100 : limit);
      }
      return res.status(200).json(response);
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const action = (body.action || 'receive').toLowerCase();

      let result;
      switch (action) {
        case 'receive':
          result = await handleReceive(body, currentUser);
          break;
        case 'transfer':
          result = await handleTransfer(body, currentUser);
          break;
        case 'adjust':
          result = await handleAdjustment(body, currentUser);
          break;
        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      return res.status(200).json({
        success: true,
        ...result,
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Branch inventory API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

