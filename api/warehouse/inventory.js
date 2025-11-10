import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, withTransaction } from '../db.js';

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

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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

function toSqlDate(dateLike) {
  if (!dateLike) return null;
  const normalized = typeof dateLike === 'string' && dateLike.length === 7 ? `${dateLike}-01` : dateLike;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeInventoryRow(row) {
  if (!row) return null;
  const quantity = parseNumber(row.quantity);
  const reserved = parseNumber(row.reserved_quantity);
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    productId: row.product_id,
    productName: row.product_name,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date instanceof Date ? row.expiry_date.toISOString().slice(0, 10) : row.expiry_date,
    quantity,
    reservedQuantity: reserved,
    availableQuantity: Math.max(0, quantity - reserved),
    unit: row.unit || 'units',
    reorderLevel: parseNumber(row.reorder_level),
    status: row.status,
    metadata: safeParseJson(row.metadata),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function normalizeMovementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    inventoryId: row.inventory_id,
    productId: row.product_id,
    productName: row.product_name,
    batchNo: row.batch_no,
    type: row.movement_type,
    quantity: parseNumber(row.quantity),
    balanceAfter: parseNumber(row.balance_after),
    reference: row.reference,
    notes: row.notes,
    metadata: safeParseJson(row.metadata),
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function ensureWarehouseExists(client, warehouseId) {
  if (!warehouseId) {
    throw new Error('warehouseId is required');
  }
  const existing = await client.query('SELECT id FROM warehouse_locations WHERE id = $1', [warehouseId]);
  if (existing.rowCount === 0) {
    throw new Error(`Warehouse ${warehouseId} not found`);
  }
}

async function ensureWarehouseExistsStandalone(warehouseId) {
  if (!warehouseId) {
    throw new Error('warehouseId is required');
  }
  const existing = await getOne('SELECT id FROM warehouse_locations WHERE id = $1', [warehouseId]);
  if (!existing) {
    throw new Error(`Warehouse ${warehouseId} not found`);
  }
}

async function findInventoryRow(client, warehouseId, productId, batchNo, expiryDate) {
  return await client.query(
    `
      SELECT *
      FROM warehouse_inventory
      WHERE warehouse_id = $1
        AND product_id = $2
        AND (batch_no IS NOT DISTINCT FROM $3)
        AND (expiry_date IS NOT DISTINCT FROM $4)
      LIMIT 1;
    `,
    [warehouseId, productId, batchNo || null, expiryDate || null]
  ).then((res) => res.rows[0] || null);
}

async function insertInventoryRow(client, payload) {
  const row = await client.query(
    `
      INSERT INTO warehouse_inventory (
        id, warehouse_id, product_id, product_name, batch_no, expiry_date,
        quantity, reserved_quantity, unit, reorder_level, status, metadata,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        COALESCE($13, NOW()), NOW()
      )
      RETURNING *;
    `,
    [
      payload.id || generateId('WHINV'),
      payload.warehouseId,
      payload.productId,
      payload.productName || null,
      payload.batchNo || null,
      payload.expiryDate || null,
      parseNumber(payload.quantity),
      parseNumber(payload.reservedQuantity),
      payload.unit || 'units',
      parseNumber(payload.reorderLevel),
      payload.status || 'available',
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.createdAt || null,
    ]
  );
  return row.rows[0];
}

async function saveMovement(client, payload) {
  const row = await client.query(
    `
      INSERT INTO warehouse_inventory_movements (
        id, warehouse_id, inventory_id, product_id, product_name, batch_no,
        movement_type, quantity, balance_after, reference, notes, metadata,
        created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, COALESCE($14, NOW())
      )
      RETURNING *;
    `,
    [
      payload.id || generateId('WHMOVE'),
      payload.warehouseId,
      payload.inventoryId || null,
      payload.productId || null,
      payload.productName || null,
      payload.batchNo || null,
      payload.type,
      parseNumber(payload.quantity),
      parseNumber(payload.balanceAfter),
      payload.reference || null,
      payload.notes || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.createdBy || null,
      payload.createdAt || null,
    ]
  );
  return row.rows[0];
}

async function adjustInventory(client, options) {
  const {
    warehouseId,
    productId,
    productName,
    batchNo,
    expiryDate,
    unit,
    reorderLevel,
    quantity,
    action,
    metadata,
    reference,
    notes,
    actor,
  } = options;

  await ensureWarehouseExists(client, warehouseId);

  const sqlExpiry = toSqlDate(expiryDate);
  const movementAction = (action || 'in').toLowerCase();
  const qty = Math.abs(parseNumber(quantity));
  if (qty === 0 && movementAction !== 'set') {
    throw new Error('quantity must be greater than zero');
  }

  let inventoryRow = await findInventoryRow(client, warehouseId, productId, batchNo, sqlExpiry);
  if (!inventoryRow) {
    inventoryRow = await insertInventoryRow(client, {
      warehouseId,
      productId,
      productName,
      batchNo,
      expiryDate: sqlExpiry,
      quantity: 0,
      reservedQuantity: 0,
      unit,
      reorderLevel,
      status: 'available',
      metadata,
    });
  }

  const currentQuantity = parseNumber(inventoryRow.quantity);
  const currentReserved = parseNumber(inventoryRow.reserved_quantity);

  let nextQuantity = currentQuantity;
  let nextReserved = currentReserved;
  let movementType = 'adjust_in';

  switch (movementAction) {
    case 'in':
      nextQuantity = currentQuantity + qty;
      movementType = 'adjust_in';
      break;
    case 'out':
      if (currentQuantity < qty) {
        throw new Error('Insufficient warehouse quantity');
      }
      nextQuantity = Math.max(0, currentQuantity - qty);
      if (nextReserved > nextQuantity) {
        nextReserved = nextQuantity;
      }
      movementType = 'adjust_out';
      break;
    case 'reserve':
      if (currentQuantity - currentReserved < qty) {
        throw new Error('Insufficient available quantity to reserve');
      }
      nextReserved = currentReserved + qty;
      movementType = 'reserve';
      break;
    case 'unreserve':
      nextReserved = Math.max(0, currentReserved - qty);
      movementType = 'release';
      break;
    case 'set': {
      const { quantity: newQuantity, reservedQuantity: newReserved } = options;
      nextQuantity = parseNumber(newQuantity, currentQuantity);
      nextReserved = parseNumber(newReserved, currentReserved);
      if (nextReserved > nextQuantity) {
        nextReserved = nextQuantity;
      }
      movementType = 'set';
      break;
    }
    default:
      throw new Error(`Unsupported action "${movementAction}"`);
  }

  const updated = await client.query(
    `
      UPDATE warehouse_inventory
      SET quantity = $1,
          reserved_quantity = $2,
          unit = COALESCE($3, unit),
          reorder_level = COALESCE($4, reorder_level),
          status = CASE
            WHEN $1 <= 0 THEN 'depleted'
            WHEN $1 - $2 <= COALESCE(reorder_level, 0) THEN 'low_stock'
            ELSE 'available'
          END,
          metadata = COALESCE($5, metadata),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *;
    `,
    [
      nextQuantity,
      nextReserved,
      unit || null,
      reorderLevel !== undefined ? parseNumber(reorderLevel) : null,
      metadata ? JSON.stringify(metadata) : null,
      inventoryRow.id,
    ]
  );

  const updatedRow = updated.rows[0];

  const movementRow = await saveMovement(client, {
    warehouseId,
    inventoryId: updatedRow.id,
    productId,
    productName: productName || updatedRow.product_name,
    batchNo: batchNo || updatedRow.batch_no,
    type: movementType,
    quantity: movementAction === 'set' ? nextQuantity - currentQuantity : qty,
    balanceAfter: nextQuantity,
    reference,
    notes,
    metadata,
    createdBy: actor,
  });

  return {
    inventory: normalizeInventoryRow(updatedRow),
    movement: normalizeMovementRow(movementRow),
  };
}

async function listInventory(searchParams) {
  const warehouseId = searchParams.get('warehouse');
  const productId = searchParams.get('product');
  const status = searchParams.get('status');

  const conditions = [];
  const params = [];

  if (warehouseId) {
    conditions.push('warehouse_id = $' + (params.length + 1));
    params.push(warehouseId);
  }
  if (productId) {
    conditions.push('product_id = $' + (params.length + 1));
    params.push(productId);
  }
  if (status) {
    conditions.push('status = $' + (params.length + 1));
    params.push(status);
  }

  let queryText = 'SELECT * FROM warehouse_inventory';
  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }
  queryText += ' ORDER BY warehouse_id ASC, product_name ASC, expiry_date ASC NULLS LAST';

  const rows = await getMany(queryText, params);
  return rows.map(normalizeInventoryRow).filter(Boolean);
}

async function listMovements(searchParams) {
  const warehouseId = searchParams.get('warehouse');
  if (!warehouseId) {
    throw new Error('warehouse parameter is required for movements');
  }
  const productId = searchParams.get('product');
  const limit = parseInt(searchParams.get('limit') || '200', 10);

  const params = [warehouseId];
  const conditions = ['warehouse_id = $1'];

  if (productId) {
    params.push(productId);
    conditions.push('product_id = $' + params.length);
  }

  let queryText = `
    SELECT *
    FROM warehouse_inventory_movements
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
  `;

  if (!Number.isNaN(limit) && limit > 0) {
    queryText += ` LIMIT ${Math.min(limit, 1000)}`;
  }

  const rows = await getMany(queryText, params);
  return rows.map(normalizeMovementRow).filter(Boolean);
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
      const includeMovements = searchParams.get('includeMovements') === '1' || searchParams.get('include_movements') === '1';
      const warehouseParam = searchParams.get('warehouse');
      if (warehouseParam) {
        await ensureWarehouseExistsStandalone(warehouseParam);
      }
      const inventory = await listInventory(searchParams);
      const response = {
        success: true,
        inventory,
      };
      if (includeMovements) {
        response.movements = await listMovements(searchParams);
      }
      return res.status(200).json(response);
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const result = await withTransaction(async (client) => {
        return adjustInventory(client, {
          warehouseId: body.warehouseId || body.warehouse_id,
          productId: body.productId || body.product_id,
          productName: body.productName || body.product_name,
          batchNo: body.batchNo || body.batch_no || null,
          expiryDate: body.expiryDate || body.expiry_date || null,
          unit: body.unit || null,
          reorderLevel: body.reorderLevel ?? body.reorder_level,
          quantity: body.quantity,
          reservedQuantity: body.reservedQuantity ?? body.reserved_quantity,
          action: body.action || 'in',
          metadata: body.metadata || null,
          reference: body.reference || null,
          notes: body.notes || null,
          actor: currentUser?.fullName || currentUser?.username || body.actor || null,
        });
      });

      return res.status(200).json({
        success: true,
        inventory: result.inventory,
        movement: result.movement,
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Warehouse inventory API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}


