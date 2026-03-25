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
  const expiryDate = row.expiry_date ? (row.expiry_date instanceof Date ? row.expiry_date.toISOString().slice(0, 10) : String(row.expiry_date).slice(0, 10)) : null;
  const qty = parseNumber(row.quantity);
  const uPrice = row.unit_price !== null ? Number(row.unit_price) : null;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at;
  return {
    id: row.id,
    branchId: row.branch_id, branch_id: row.branch_id,
    productName: row.product_name, product_name: row.product_name,
    productCode: row.product_code, product_code: row.product_code,
    batchNo: row.batch_no, batch_no: row.batch_no, batch_number: row.batch_no,
    expiryDate, expiry_date: expiryDate,
    quantity: qty,
    unit: row.unit || 'units',
    unitPrice: uPrice, unit_price: uPrice,
    description: row.description || row.product_name,
    status: row.status || (qty > 0 ? 'in_stock' : 'out_of_stock'),
    metadata: typeof row.metadata === 'object' ? row.metadata : null,
    createdAt, created_at: createdAt,
    updatedAt, updated_at: updatedAt,
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

function normalizeBranchId(raw) {
  if (!raw) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return key;
}

async function resolveBranchId(raw) {
  const key = normalizeBranchId(raw);
  if (!key) return key;
  const exact = await getOne('SELECT branch_id FROM branch_inventory_batches WHERE branch_id = $1 LIMIT 1', [key]);
  if (exact) return exact.branch_id;
  const withSuffix = await getOne('SELECT branch_id FROM branch_inventory_batches WHERE branch_id = $1 LIMIT 1', [key + '_branch']);
  if (withSuffix) return withSuffix.branch_id;
  const stripped = key.replace(/_branch$/, '');
  if (stripped !== key) {
    const noSuffix = await getOne('SELECT branch_id FROM branch_inventory_batches WHERE branch_id = $1 LIMIT 1', [stripped]);
    if (noSuffix) return noSuffix.branch_id;
  }
  const like = await getOne('SELECT branch_id FROM branch_inventory_batches WHERE branch_id ILIKE $1 LIMIT 1', [`%${key}%`]);
  if (like) return like.branch_id;
  return key;
}

async function getInventoryByBranch(branchId, enriched = false) {
  const resolvedId = await resolveBranchId(branchId);
  const rows = await getMany(
    `SELECT * FROM branch_inventory_batches WHERE branch_id = $1 ORDER BY product_name ASC, expiry_date ASC NULLS LAST`,
    [resolvedId]
  );
  const normalized = rows.map(normalizeInventoryRow).filter(Boolean);
  if (!enriched) return normalized;

  // Pull movement aggregates from branch_inventory_movements (for received, dispensed, transferred, etc.)
  // and separately pull sold quantities from branch_walkin_sales (the authoritative sales source).
  let movAgg = [];
  let walkinSoldAgg = [];
  try {
    [movAgg, walkinSoldAgg] = await Promise.all([
      getMany(
        `SELECT product_name,
           type,
           SUM(ABS(quantity)) as total_qty,
           MAX(created_at) as last_date,
           (array_agg(DISTINCT source_branch_id) FILTER (WHERE source_branch_id IS NOT NULL))[1] as source
         FROM branch_inventory_movements
         WHERE branch_id = $1
         GROUP BY product_name, type`,
        [resolvedId]
      ),
      // Walkin sales: items use camelCase productName and quantity
      getMany(
        `SELECT
           COALESCE(item->>'product_name', item->>'productName') AS product_name,
           SUM(COALESCE((item->>'quantity')::numeric, (item->>'qty')::numeric, 0)) AS total_sold,
           MAX(created_at) AS last_date
         FROM branch_walkin_sales,
              jsonb_array_elements(items) AS item
         WHERE branch_id = $1
           AND status != 'cancelled'
           AND items IS NOT NULL
           AND jsonb_array_length(items) > 0
         GROUP BY COALESCE(item->>'product_name', item->>'productName')`,
        [resolvedId]
      ),
    ]);
  } catch (err) {
    console.error('[inventory] enrichment query error:', err.message);
  }

  // Build walkin sold map keyed by product_name (covers both camelCase and snake_case item keys)
  const walkinSoldMap = {};
  for (const r of walkinSoldAgg) {
    const key = (r.product_name || '').trim();
    if (key) walkinSoldMap[key] = (walkinSoldMap[key] || 0) + Number(r.total_sold || 0);
  }

  // Build aggMap keyed by product_name.
  // SOLD = walkin sales + prescription dispenses (per user definition).
  const aggMap = {};
  const EMPTY_AGG = () => ({ received: 0, walkin_sold: 0, dispensed: 0, sold: 0, transferred: 0, written_off: 0, adjusted: 0, source_warehouse: null, last_movement: null });
  for (const r of movAgg) {
    const key = (r.product_name || '').trim();
    if (!aggMap[key]) aggMap[key] = EMPTY_AGG();
    const a = aggMap[key];
    const q = Number(r.total_qty || 0);
    const t = (r.type || '').toLowerCase();
    if (t === 'receive' || t === 'received' || t === 'stock_receipt' || t === 'transfer_in') { a.received += q; if (r.source) a.source_warehouse = r.source; }
    else if (t === 'sale' || t === 'walk_in_member_sale' || t === 'walk_in_non_member_sale' || t === 'online_order_sale') a.walkin_sold += q;
    else if (t === 'dispense' || t === 'prescription_dispense' || t === 'field_use') a.dispensed += q;
    else if (t === 'transfer_out' || t === 'transfer') a.transferred += q;
    else if (t === 'write_off') a.written_off += q;
    else if (t === 'adjustment' || t === 'return' || t === 'return_in') a.adjusted += q;
    const ld = r.last_date instanceof Date ? r.last_date.toISOString() : r.last_date;
    if (!a.last_movement || (ld && ld > a.last_movement)) a.last_movement = ld;
  }

  // Merge walkin sold from branch_walkin_sales (authoritative — always recorded even when
  // stock deduction fails to match a batch). Use whichever is higher to avoid under-reporting.
  for (const [productName, walkinQty] of Object.entries(walkinSoldMap)) {
    if (!aggMap[productName]) aggMap[productName] = EMPTY_AGG();
    aggMap[productName].walkin_sold = Math.max(aggMap[productName].walkin_sold, walkinQty);
  }

  // Compute combined sold = walkin_sold + dispensed (prescription dispenses count as sales)
  for (const a of Object.values(aggMap)) {
    a.sold = a.walkin_sold + a.dispensed;
  }

  // When a branch has multiple batches of the same product, distribute aggregated
  // quantities proportionally by batch size (or equally if all zero).
  const productBatches = {};
  for (const inv of normalized) {
    const key = (inv.product_name || '').trim();
    if (!productBatches[key]) productBatches[key] = [];
    productBatches[key].push(inv);
  }

  return normalized.map(inv => {
    const key = (inv.product_name || '').trim();
    const agg = aggMap[key] || EMPTY_AGG();
    const siblings = productBatches[key] || [inv];
    const totalQty = siblings.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const weight = totalQty > 0 ? Number(inv.quantity || 0) / totalQty : 1 / siblings.length;
    const scale = (v) => Math.round(v * weight * 100) / 100;
    return {
      ...inv,
      qty_received: scale(agg.received), qtyReceived: scale(agg.received),
      qty_sold: scale(agg.sold), qtySold: scale(agg.sold),
      qty_dispensed: scale(agg.dispensed), qtyDispensed: scale(agg.dispensed),
      qty_transferred: scale(agg.transferred), qtyTransferred: scale(agg.transferred),
      qty_written_off: scale(agg.written_off), qtyWrittenOff: scale(agg.written_off),
      qty_adjusted: scale(agg.adjusted), qtyAdjusted: scale(agg.adjusted),
      source_warehouse: agg.source_warehouse, sourceWarehouse: agg.source_warehouse,
      last_movement_date: agg.last_movement, lastMovementDate: agg.last_movement,
    };
  });
}

async function getMovementsByBranch(branchId, limit = 100) {
  const resolvedId = await resolveBranchId(branchId);
  const rows = await getMany(
    `SELECT * FROM branch_inventory_movements WHERE branch_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [resolvedId, limit]
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
      const branchId = searchParams.get('branch') || searchParams.get('branch_id');
      if (!branchId) {
        const allRows = await getMany('SELECT * FROM branch_inventory_batches ORDER BY product_name ASC, expiry_date ASC NULLS LAST LIMIT 500');
        return res.status(200).json({ success: true, inventory: allRows.map(normalizeInventoryRow).filter(Boolean) });
      }
      const includeMovements = searchParams.get('includeMovements') === '1' || searchParams.get('include_movements') === '1';
      const _enrichedRaw = searchParams.get('enriched');
      const enrichedParam = _enrichedRaw === '1' || _enrichedRaw === 'true' || searchParams.get('include_aggregates') === '1';
      const inventory = await getInventoryByBranch(branchId, enrichedParam || includeMovements);
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
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

