import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

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
  if (key === 'katima' || key === 'katima-mulilo') return 'katima_mulilo';
  return key;
}

async function resolveBranchId(raw) {
  const key = normalizeBranchId(raw);
  if (!key) return key;
  const stripped = key.replace(/_branch$/, '');
  const candidates = [key];
  if (!key.endsWith('_branch')) candidates.push(key + '_branch');
  if (stripped !== key) candidates.push(stripped);
  if (key === 'katima_mulilo') candidates.push('katima');
  if (key === 'katima') candidates.push('katima_mulilo');
  // Exact match first
  const result = await getOne(
    `SELECT branch_id FROM branch_inventory_batches WHERE branch_id = ANY($1) LIMIT 1`,
    [candidates]
  );
  if (result) return result.branch_id;
  // Case-insensitive + whitespace-normalised fallback:
  // Normalise DB values the same way normalizeBranchId does (lowercase + spaces→underscores)
  // so "Oshakati Branch", "oshakati_branch", and "oshakati" all match.
  const ciResult = await getOne(
    `SELECT branch_id FROM branch_inventory_batches
     WHERE LOWER(REPLACE(branch_id, ' ', '_')) = ANY($1) LIMIT 1`,
    [candidates]
  );
  return ciResult ? ciResult.branch_id : key;
}

/**
 * Build every known alias form for a branch slug so we can query all of them
 * in a single ANY($1) clause. Catches rows stored under historical alias IDs
 * (e.g. 'katima' vs 'katima_mulilo', 'hochlandpark' vs 'hochland-park').
 */
function buildBranchCandidates(...ids) {
  const set = new Set();
  for (const id of ids) {
    if (!id) continue;
    const s = id.trim().toLowerCase();
    set.add(s);
    set.add(id); // original casing preserved as well
    // _branch suffix variants
    if (s.endsWith('_branch')) set.add(s.replace(/_branch$/, ''));
    else                        set.add(s + '_branch');
    // Katima Mulilo
    if (s === 'katima_mulilo') { set.add('katima'); set.add('katima-mulilo'); set.add('katima_branch'); set.add('katima_mulilo_branch'); }
    if (s === 'katima')         set.add('katima_mulilo');
    // Oshakati
    if (s === 'oshakati_branch') set.add('oshakati');
    if (s === 'oshakati')        set.add('oshakati_branch');
    // Hochland Park
    if (s === 'hochland-park')   { set.add('hochlandpark'); set.add('hochland_park'); }
    if (s === 'hochlandpark' || s === 'hochland_park') set.add('hochland-park');
    // Walvis Bay
    if (s === 'walvisbay')       { set.add('walvis_bay'); set.add('walvis bay'); }
    if (s === 'walvis_bay')      set.add('walvisbay');
    // Windhoek CBD / Townshop
    if (s === 'townshop')        { set.add('windhoek'); set.add('windhoek_cbd'); }
    if (s === 'windhoek_cbd' || s === 'windhoek') set.add('townshop');
  }
  return [...set].filter(Boolean);
}

async function getInventoryByBranch(branchId, enriched = false) {
  const resolvedId = await resolveBranchId(branchId);
  // Query with ALL alias forms so rows stored under any historical variant are returned.
  const allCandidates = buildBranchCandidates(resolvedId, branchId);
  const rows = await getMany(
    `SELECT * FROM branch_inventory_batches WHERE branch_id = ANY($1::text[]) AND quantity > 0 ORDER BY product_name ASC, expiry_date ASC NULLS LAST`,
    [allCandidates]
  );
  const normalized = rows.map(normalizeInventoryRow).filter(Boolean);

  // Merge with inventory_balances:
  //  1. Add any items that exist ONLY in inventory_balances (stock that came via
  //     the centralised stock engine path but never wrote to branch_inventory_batches).
  //  2. Correct quantities for items that ARE in branch_inventory_batches but whose
  //     quantity was overwritten to a lower value by a previous (now-removed) sync
  //     job — use GREATEST(bib_qty, ib_qty) so we never display a quantity lower than
  //     what inventory_balances says the closing balance is.
  try {
    // Build all plausible location_id values for this branch so data stored
    // under 'oshakati', 'oshakati_branch', or any normalised variant is found.
    const ibCandidates = [resolvedId];
    const strippedResolved = resolvedId.replace(/_branch$/, '');
    if (!resolvedId.endsWith('_branch')) ibCandidates.push(resolvedId + '_branch');
    if (strippedResolved !== resolvedId) ibCandidates.push(strippedResolved);

    const ibRows = await getMany(
      `SELECT product_name, batch_no, expiry_date, GREATEST(closing_qty, 0) AS quantity, unit_dp
       FROM inventory_balances
       WHERE location_type = 'branch' AND location_id = ANY($1)`,
      [ibCandidates]
    );
    const normKey = (pn, bn) => `${(pn || '').trim().toLowerCase()}|${(bn || '').trim().toLowerCase()}`;
    // Build lookup map: key → index in normalized array
    const existingMap = new Map();
    normalized.forEach((n, idx) => existingMap.set(normKey(n.product_name, n.batch_no), idx));

    for (const ib of ibRows) {
      const key = normKey(ib.product_name, ib.batch_no);
      const ibQty = parseNumber(ib.quantity);
      if (existingMap.has(key)) {
        // Item already in branch_inventory_batches — that table is authoritative.
        // Do NOT override with inventory_balances value; doing so would cause
        // written-off stock to reappear if inventory_balances is momentarily stale.
      } else if (ibQty > 0) {
        // Item only exists in inventory_balances — add it
        const expiryDate = ib.expiry_date ? (ib.expiry_date instanceof Date ? ib.expiry_date.toISOString().slice(0, 10) : String(ib.expiry_date).slice(0, 10)) : null;
        const syntheticId = `IB-${(resolvedId || '').toLowerCase().replace(/\s+/g, '_')}-${(ib.product_name || '').trim().toLowerCase().replace(/\s+/g, '_')}-${(ib.batch_no || 'nobatch').trim().toLowerCase()}`;
        normalized.push({
          id: syntheticId,
          branchId: resolvedId, branch_id: resolvedId,
          productName: ib.product_name, product_name: ib.product_name,
          productCode: null, product_code: null,
          batchNo: ib.batch_no, batch_no: ib.batch_no, batch_number: ib.batch_no,
          expiryDate, expiry_date: expiryDate,
          quantity: ibQty,
          unit: 'units',
          unitPrice: ib.unit_dp ? Number(ib.unit_dp) : null,
          unit_price: ib.unit_dp ? Number(ib.unit_dp) : null,
          description: ib.product_name,
          status: 'in_stock',
          metadata: null,
          createdAt: null, created_at: null,
          updatedAt: null, updated_at: null,
          _source: 'inventory_balances',
        });
        existingMap.set(key, normalized.length - 1);
      }
    }
  } catch (err) {
    console.error('[inventory] inventory_balances merge error:', err.message);
  }

  normalized.sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));

  if (!enriched) return normalized;

  // Pull movement aggregates from branch_inventory_movements (for received, dispensed, transferred, etc.)
  // and separately pull sold quantities from branch_walkin_sales (the authoritative sales source).
  let movAgg = [];
  let walkinSoldAgg = [];
  let bibSourceMap = {}; // product_name (lower) → source_warehouse from branch_inventory_batches
  try {
    // Also pull source_warehouse directly from branch_inventory_batches as a fallback for
    // historical dispatch receipts that were inserted before source_branch_id was recorded
    // in branch_inventory_movements.
    const bibSources = await getMany(
      `SELECT LOWER(TRIM(product_name)) AS pname, source_warehouse
       FROM branch_inventory_batches
       WHERE branch_id = $1 AND source_warehouse IS NOT NULL`,
      [resolvedId]
    );
    for (const row of bibSources) {
      if (row.pname && row.source_warehouse) bibSourceMap[row.pname] = row.source_warehouse;
    }
  } catch (_) {}
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

  // Normalise a product name for matching: lowercase + collapse whitespace.
  // This ensures "Noni Juice 1L" matches "NONI JUICE 1L", "noni juice 1l", etc.
  const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Build walkin sold map keyed by normalised product name.
  // Also keep the original-case name so we can create synthetic rows later.
  const walkinSoldMap = {}; // normKey → { qty, originalName }
  for (const r of walkinSoldAgg) {
    const origName = (r.product_name || '').trim();
    const key = norm(origName);
    if (!key) continue;
    if (!walkinSoldMap[key]) walkinSoldMap[key] = { qty: 0, originalName: origName };
    walkinSoldMap[key].qty += Number(r.total_sold || 0);
  }

  // Build aggMap keyed by normalised product_name.
  // SOLD = walkin sales + prescription dispenses (per user definition).
  const aggMap = {};
  const EMPTY_AGG = () => ({ received: 0, walkin_sold: 0, dispensed: 0, sold: 0, transferred: 0, written_off: 0, adjusted: 0, source_warehouse: null, last_movement: null });
  for (const r of movAgg) {
    const key = norm(r.product_name);
    if (!key) continue;
    if (!aggMap[key]) aggMap[key] = EMPTY_AGG();
    const a = aggMap[key];
    const q = Number(r.total_qty || 0);
    const t = (r.type || '').toLowerCase();
    if (t === 'receive' || t === 'received' || t === 'stock_receipt' || t === 'transfer_in') {
      a.received += q;
      // source_branch_id in branch_inventory_movements is the warehouse that dispatched this stock.
      // Fall back to branch_inventory_batches.source_warehouse for historical records where
      // source_branch_id was not recorded at receipt time.
      if (r.source) a.source_warehouse = r.source;
      else if (!a.source_warehouse && bibSourceMap[key]) a.source_warehouse = bibSourceMap[key];
    }
    else if (t === 'sale' || t === 'walk_in_member_sale' || t === 'walk_in_non_member_sale' || t === 'online_order_sale') a.walkin_sold += q;
    else if (t === 'dispense' || t === 'prescription_dispense' || t === 'field_use') a.dispensed += q;
    else if (t === 'transfer_out' || t === 'transfer') a.transferred += q;
    else if (t === 'write_off') a.written_off += q;
    else if (t === 'adjustment' || t === 'return' || t === 'return_in') a.adjusted += q;
    const ld = r.last_date instanceof Date ? r.last_date.toISOString() : r.last_date;
    if (!a.last_movement || (ld && ld > a.last_movement)) a.last_movement = ld;
  }
  // Apply bibSourceMap fallback for products that never had a 'receive' movement recorded
  // (e.g. stock loaded via the startup backfill or direct DB insert) so SOURCE always shows.
  for (const [pname, srcWh] of Object.entries(bibSourceMap)) {
    if (!aggMap[pname]) aggMap[pname] = EMPTY_AGG();
    if (!aggMap[pname].source_warehouse) aggMap[pname].source_warehouse = srcWh;
  }

  // Merge walkin sold from branch_walkin_sales (authoritative — always recorded even when
  // stock deduction fails to match a batch). Use whichever is higher.
  for (const [normKey, { qty: walkinQty }] of Object.entries(walkinSoldMap)) {
    if (!aggMap[normKey]) aggMap[normKey] = EMPTY_AGG();
    aggMap[normKey].walkin_sold = Math.max(aggMap[normKey].walkin_sold, walkinQty);
  }

  // Sold = walk-in/online sales only; dispensed remains separate
  for (const a of Object.values(aggMap)) {
    a.sold = a.walkin_sold;
  }

  // Track which norm keys already have a batch record
  const batchNormKeys = new Set(normalized.map(inv => norm(inv.product_name)));

  // When a branch has multiple batches of the same product, distribute aggregated
  // quantities proportionally by batch size (or equally if all zero).
  const productBatches = {};
  for (const inv of normalized) {
    const key = norm(inv.product_name);
    if (!productBatches[key]) productBatches[key] = [];
    productBatches[key].push(inv);
  }

  const batchRows = normalized.map(inv => {
    const key = norm(inv.product_name);
    const agg = aggMap[key] || EMPTY_AGG();
    const siblings = productBatches[key] || [inv];
    const totalQty = siblings.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const weight = totalQty > 0 ? Number(inv.quantity || 0) / totalQty : 1 / siblings.length;
    const scale = (v) => Math.round(v * weight);
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

  // Add synthetic rows for products that were sold/dispensed but have NO batch record.
  // These appear as "sold out / no batch" lines so the SOLD count is always visible.
  const syntheticRows = [];
  for (const [normKey, { qty: walkinQty, originalName }] of Object.entries(walkinSoldMap)) {
    if (batchNormKeys.has(normKey)) continue; // already covered by a batch row
    const agg = aggMap[normKey] || EMPTY_AGG();
    agg.sold = agg.walkin_sold;
    if (agg.sold <= 0 && agg.dispensed <= 0) continue; // nothing to show
    syntheticRows.push({
      id: `synthetic-${normKey}`,
      branch_id: resolvedId,
      product_name: originalName,
      batch_no: '—',
      expiry_date: null,
      quantity: 0,
      unit: 'units',
      unit_price: null,
      status: 'out_of_stock',
      is_synthetic: true,
      qty_received: Math.round(agg.received),  qtyReceived: Math.round(agg.received),
      qty_sold: Math.round(agg.sold),           qtySold: Math.round(agg.sold),
      qty_dispensed: Math.round(agg.dispensed), qtyDispensed: Math.round(agg.dispensed),
      qty_transferred: Math.round(agg.transferred), qtyTransferred: Math.round(agg.transferred),
      qty_written_off: Math.round(agg.written_off),  qtyWrittenOff: Math.round(agg.written_off),
      qty_adjusted: Math.round(agg.adjusted),   qtyAdjusted: Math.round(agg.adjusted),
      source_warehouse: agg.source_warehouse, sourceWarehouse: agg.source_warehouse,
      last_movement_date: agg.last_movement,  lastMovementDate: agg.last_movement,
    });
  }

  return [...batchRows, ...syntheticRows];
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
      Math.round(parseNumber(quantity)),
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
    quantity: Math.round(parseNumber(payload.quantity)),
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

    const inventory = await getInventoryByBranch(branchId, true);
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

    const inventory = await getInventoryByBranch(fromBranchId, true);
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

    const inventory = await getInventoryByBranch(branchId, true);
    return { inventory, movement };
  });

  return result;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const currentUser = req.user || null;
  const branchScope = getBranchScope(currentUser);

  try {
    if (req.method === 'GET') {
      const rawRequestedBranch = searchParams.get('branch') || searchParams.get('branch_id');
      // Normalize to canonical slug so 'katima', 'Katima Mulilo', etc. all resolve correctly.
      const requestedBranch = rawRequestedBranch
        ? (normalizeBranchSlug(rawRequestedBranch) || rawRequestedBranch)
        : null;
      // Normalize the scope branches for comparison (handles users whose DB branch value is
      // a non-canonical alias like 'katima' instead of 'katima_mulilo').
      const normalizedScopeBranches = branchScope.enforced
        ? branchScope.branches.map(b => normalizeBranchSlug(b) || b)
        : null;

      if (branchScope.enforced && !requestedBranch) {
        const inventory = [];
        for (const b of (normalizedScopeBranches || [])) {
          const inv = await getInventoryByBranch(b, true);
          inventory.push(...inv);
        }
        return res.status(200).json({ success: true, inventory });
      }
      if (!requestedBranch) {
        // Require an explicit branch parameter — returning all branches' inventory
        // without a filter causes phantom stock to appear under whichever branch
        // happens to be labelled in the UI when the request fires.
        return res.status(400).json({ success: false, error: 'branch parameter is required' });
      }
      if (branchScope.enforced && !normalizedScopeBranches.includes(requestedBranch)) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot view inventory for this branch' });
      }
      const includeMovements = searchParams.get('includeMovements') === '1' || searchParams.get('include_movements') === '1';
      const inventory = await getInventoryByBranch(requestedBranch, true);
      const response = {
        success: true,
        inventory,
      };
      if (includeMovements) {
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        response.movements = await getMovementsByBranch(requestedBranch, Number.isNaN(limit) ? 100 : limit);
      }
      return res.status(200).json(response);
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const action = (body.action || 'receive').toLowerCase();
      const rawTargetBranchId = body.branchId || body.fromBranchId;
      const rawDestBranchId = body.toBranchId || null;
      // Normalize to canonical slugs so non-canonical values ('katima', 'Katima Mulilo', etc.) are handled.
      const targetBranchId = rawTargetBranchId ? (normalizeBranchSlug(rawTargetBranchId) || rawTargetBranchId) : null;
      const destBranchId = rawDestBranchId ? (normalizeBranchSlug(rawDestBranchId) || rawDestBranchId) : null;
      const normalizedPostScopeBranches = branchScope.enforced
        ? branchScope.branches.map(b => normalizeBranchSlug(b) || b)
        : null;

      if (branchScope.enforced) {
        if (!targetBranchId) {
          return res.status(400).json({ success: false, error: 'branchId is required' });
        }
        if (!normalizedPostScopeBranches.includes(targetBranchId)) {
          return res.status(403).json({ success: false, error: 'Access denied: cannot modify inventory for this branch' });
        }
        if (destBranchId && !normalizedPostScopeBranches.includes(destBranchId)) {
          return res.status(403).json({ success: false, error: 'Access denied: cannot transfer inventory to this branch' });
        }
      }

      let result;
      switch (action) {
        // Pass a normalized body so all handler functions receive canonical branch slugs.
        case 'receive':
          result = await handleReceive({ ...body, branchId: targetBranchId, fromBranchId: targetBranchId }, currentUser);
          // Refresh inventory_balances cache for the branch after receiving stock
          if (targetBranchId) {
            recomputeLocationBalances('branch', targetBranchId).catch(e =>
              console.error('[branch/inventory] post-receive recompute error:', e.message)
            );
          }
          break;
        case 'transfer':
          result = await handleTransfer({ ...body, fromBranchId: targetBranchId, toBranchId: destBranchId }, currentUser);
          break;
        case 'adjust':
          result = await handleAdjustment({ ...body, branchId: targetBranchId }, currentUser);
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

