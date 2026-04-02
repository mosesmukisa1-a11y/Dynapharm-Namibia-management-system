/**
 * Centralized Stock Movement Engine
 * Single source of truth: stock_movements
 * Fast-read cache: inventory_balances
 */
import { query, getOne, publishRealtimeEvent } from '../db.js';

// Movement types that INCREASE stock at the destination location
export const INWARD_TYPES = new Set([
  'supplier_import_receipt',
  'warehouse_receipt',
  'branch_receipt',
  'transfer_in',
  'received',
  'return_in',
  'positive_adjustment',
]);

// Movement types that DECREASE stock from the source location
export const OUTWARD_TYPES = new Set([
  'warehouse_dispatch',
  'transfer_out',
  'reserved',
  'walkin_sale',
  'walkin_member_sale',
  'walkin_non_member_sale',
  'walk_in_member_sale',
  'walk_in_non_member_sale',
  'online_order_fulfilment',
  'prescription_dispense',
  'write_off',
  'return_out',
  'negative_adjustment',
  'sale',
  'field_use',
]);

/**
 * Infer the location type from a location string.
 * Used for legacy records that pre-date the source_location_type column.
 */
export function inferLocationType(locationStr) {
  if (!locationStr) return null;
  const loc = locationStr.toLowerCase().trim();
  if (loc === '' || loc === 'branch') return null;
  if (loc === 'country_stock' || loc === 'external_supplier_source') return 'country';
  if (loc.includes('warehouse')) return 'warehouse';
  if (['customer', 'patient', 'written_off', 'field'].includes(loc)) return null;
  if (loc.startsWith('in_transit')) return 'in_transit';
  return 'branch';
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Recompute inventory_balances for a given location + product + batch.
 * Reads ALL posted stock_movements for that product+batch, then sums
 * inward/outward relative to the specified location.
 *
 * @param {object} key
 * @param {string} key.locationType  - 'branch' | 'warehouse' | 'country' | 'in_transit'
 * @param {string} key.locationId    - e.g. 'oshakati_branch', 'windhoek_warehouse'
 * @param {string} key.productName
 * @param {string} [key.batchNo]
 * @param {string} [key.expiryDate]  - ISO date string or null
 */
export async function recomputeInventoryBalance(key) {
  const { locationType, locationId, productName, batchNo, expiryDate } = key;
  const batchNoVal = batchNo || '';
  let expiryVal = expiryDate || null;

  // Fetch ALL posted movements for this product+batch (filter location in JS for legacy compatibility)
  const result = await query(
    `SELECT movement_type, quantity, source_location, destination_location,
            source_location_type, destination_location_type,
            unit_dp, unit_cif, expiry_date, created_at
     FROM stock_movements
     WHERE status = 'posted'
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
       AND COALESCE(batch_no, '') = $2
     ORDER BY created_at ASC`,
    [productName, batchNoVal]
  );

  let inwardQty = 0;
  let outwardQty = 0;
  let unitDP = 0;
  let unitCIF = 0;
  let lastMovementDate = null;

  for (const m of result.rows) {
    if (!expiryVal && m.expiry_date) {
      expiryVal = m.expiry_date;
    }
    const srcType = m.source_location_type || inferLocationType(m.source_location);
    const dstType = m.destination_location_type || inferLocationType(m.destination_location);

    const qty = Number(m.quantity || 0);
    if (m.unit_dp) unitDP = Number(m.unit_dp);
    if (m.unit_cif) unitCIF = Number(m.unit_cif);

    const isInbound = dstType === locationType &&
      m.destination_location === locationId &&
      INWARD_TYPES.has(m.movement_type);

    const isOutbound = srcType === locationType &&
      m.source_location === locationId &&
      OUTWARD_TYPES.has(m.movement_type);

    if (isInbound) {
      inwardQty += qty;
      lastMovementDate = m.created_at;
    }
    if (isOutbound) {
      outwardQty += qty;
      lastMovementDate = m.created_at;
    }
  }

  const closingQty = inwardQty - outwardQty;
  const stockValueDP = closingQty * (unitDP || 0);
  const stockValueCIF = closingQty * (unitCIF || 0);

  // Upsert keyed by (location_type, location_id, product_name, batch_no).
  // expiry_date is metadata, NOT part of the key — prevents duplicates when
  // the seed stores null and recompute later sees an actual expiry_date.
  const existing = await getOne(
    `SELECT id FROM inventory_balances
     WHERE location_type = $1
       AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
       AND COALESCE(batch_no, '') = $4`,
    [locationType, locationId, productName, batchNoVal]
  );

  if (existing) {
    await query(
      `UPDATE inventory_balances
       SET inward_qty = $1,
           outward_qty = $2,
           closing_qty = $3,
           unit_dp = COALESCE($4, unit_dp),
           unit_cif = COALESCE($5, unit_cif),
           stock_value_dp = $6,
           stock_value_cif = $7,
           last_movement_date = $8,
           expiry_date = COALESCE($9::date, expiry_date),
           updated_at = NOW()
       WHERE id = $10`,
      [inwardQty, outwardQty, closingQty,
       unitDP || null, unitCIF || null,
       stockValueDP, stockValueCIF,
       lastMovementDate, expiryVal, existing.id]
    );
  } else {
    const balId = generateId('BAL');
    await query(
      `INSERT INTO inventory_balances
         (id, location_type, location_id, product_name, batch_no, expiry_date,
          opening_qty, inward_qty, outward_qty, closing_qty,
          unit_dp, unit_cif, stock_value_dp, stock_value_cif,
          last_movement_date, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6::date, 0,$7,$8,$9,$10,$11,$12,$13,$14,NOW())`,
      [balId, locationType, locationId, productName, batchNoVal, expiryVal,
       inwardQty, outwardQty, closingQty,
       unitDP || null, unitCIF || null,
       stockValueDP, stockValueCIF,
       lastMovementDate]
    );
  }

}

/**
 * Retrieve the current available (closing) quantity from inventory_balances.
 */
export async function getAvailableStock(key) {
  const { locationType, locationId, productName, batchNo, expiryDate } = key;
  const row = await getOne(
    `SELECT closing_qty FROM inventory_balances
     WHERE location_type = $1
       AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
       AND COALESCE(batch_no, '') = $4
       AND (expiry_date IS NOT DISTINCT FROM $5::date)`,
    [locationType, locationId, productName, batchNo || '', expiryDate || null]
  );
  return Number(row?.closing_qty ?? 0);
}

/**
 * Post a single stock movement and recompute affected inventory balances.
 * This is the ONLY function that should write to stock_movements for stock-affecting events.
 *
 * @param {object} input
 * @param {string} input.movementType     - required
 * @param {string} input.productName      - required
 * @param {number} input.quantity         - required, must be > 0
 * @param {string} [input.productId]
 * @param {string} [input.batchNo]
 * @param {string} [input.expiryDate]
 * @param {number} [input.unitDP]
 * @param {number} [input.unitCIF]
 * @param {string} [input.sourceLocation]
 * @param {string} [input.sourceLocationType]
 * @param {string} [input.destinationLocation]
 * @param {string} [input.destinationLocationType]
 * @param {string} [input.referenceId]
 * @param {string} [input.referenceType]
 * @param {string} [input.notes]
 * @param {string} [input.createdBy]
 * @param {Date}   [input.movementDate]
 * @returns {string} The movement ID
 */
async function _postStockMovementInternal(queryFn, input) {
  if (!input.productName) throw new Error('Missing productName');
  if (!input.quantity || Number(input.quantity) <= 0) throw new Error('Quantity must be greater than zero');
  if (!input.movementType) throw new Error('movementType is required');

  const id = input.id || generateId('SM');
  const srcLoc = input.sourceLocation || input.source_location || null;
  const dstLoc = input.destinationLocation || input.destination_location || null;
  const srcLocType = input.sourceLocationType || inferLocationType(srcLoc);
  const dstLocType = input.destinationLocationType || inferLocationType(dstLoc);
  const batchNo = input.batchNo || input.batch_no || null;
  const expiryDate = input.expiryDate || input.expiry_date || null;
  const unitDP = input.unitDP || input.unit_dp || null;
  const unitCIF = input.unitCIF || input.unit_cif || null;
  const productId = input.productId || input.product_id || null;
  const referenceId = input.referenceId || input.reference_id || null;
  const referenceType = input.referenceType || input.reference_type || null;
  const createdBy = input.createdBy || input.created_by || null;
  const notes = input.notes || null;
  const movementDate = input.movementDate || new Date();

  await queryFn(
    `INSERT INTO stock_movements
       (id, product_name, product_id, batch_no, expiry_date, quantity,
        movement_type, source_location, destination_location,
        source_location_type, destination_location_type,
        unit_dp, unit_cif, reference_type, reference_id, notes, created_by,
        movement_date, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'posted',NOW(),NOW())`,
    [id, input.productName, productId, batchNo, expiryDate, Number(input.quantity),
     input.movementType, srcLoc, dstLoc, srcLocType, dstLocType,
     unitDP, unitCIF, referenceType, referenceId, notes, createdBy, movementDate]
  );

  const recomputeTargets = [];
  if (srcLocType && srcLoc) {
    recomputeTargets.push({ locationType: srcLocType, locationId: srcLoc, productName: input.productName, batchNo: batchNo || '', expiryDate });
  }
  if (dstLocType && dstLoc) {
    recomputeTargets.push({ locationType: dstLocType, locationId: dstLoc, productName: input.productName, batchNo: batchNo || '', expiryDate });
  }
  for (const target of recomputeTargets) {
    try {
      await recomputeInventoryBalance(target);
    } catch (err) {
      console.error('[stockEngine] recomputeInventoryBalance error:', err.message);
    }
  }

  publishRealtimeEvent('stock', 'movement', {
    movementId: id,
    productName: input.productName,
    movementType: input.movementType,
    quantity: Number(input.quantity),
    sourceLocation: srcLoc,
    destinationLocation: dstLoc,
  }).catch(() => {});

  return id;
}

export async function postStockMovement(input) {
  return _postStockMovementInternal((text, params) => query(text, params), input);
}

/**
 * Transactional variant: inserts stock_movement via the provided DB client (within a transaction).
 * Skips recompute during the call — caller must invoke recomputeInventoryBalance() for each
 * returned target AFTER the transaction commits so the pool reads the now-committed rows.
 *
 * @returns {{ movementId: string, recomputeTargets: Array }} Targets to recompute post-commit.
 */
export async function postStockMovementTx(client, input) {
  if (!input.productName) throw new Error('Missing productName');
  if (!input.quantity || Number(input.quantity) <= 0) throw new Error('Quantity must be greater than zero');
  if (!input.movementType) throw new Error('movementType is required');

  const id = input.id || generateId('SM');
  const srcLoc = input.sourceLocation || input.source_location || null;
  const dstLoc = input.destinationLocation || input.destination_location || null;
  const srcLocType = input.sourceLocationType || inferLocationType(srcLoc);
  const dstLocType = input.destinationLocationType || inferLocationType(dstLoc);
  const batchNo = input.batchNo || input.batch_no || null;
  const expiryDate = input.expiryDate || input.expiry_date || null;
  const unitDP = input.unitDP || input.unit_dp || null;
  const unitCIF = input.unitCIF || input.unit_cif || null;
  const productId = input.productId || input.product_id || null;
  const referenceId = input.referenceId || input.reference_id || null;
  const referenceType = input.referenceType || input.reference_type || null;
  const createdBy = input.createdBy || input.created_by || null;
  const notes = input.notes || null;
  const movementDate = input.movementDate || new Date();

  await client.query(
    `INSERT INTO stock_movements
       (id, product_name, product_id, batch_no, expiry_date, quantity,
        movement_type, source_location, destination_location,
        source_location_type, destination_location_type,
        unit_dp, unit_cif, reference_type, reference_id, notes, created_by,
        movement_date, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'posted',NOW(),NOW())`,
    [id, input.productName, productId, batchNo, expiryDate, Number(input.quantity),
     input.movementType, srcLoc, dstLoc, srcLocType, dstLocType,
     unitDP, unitCIF, referenceType, referenceId, notes, createdBy, movementDate]
  );

  const recomputeTargets = [];
  if (srcLocType && srcLoc) {
    recomputeTargets.push({ locationType: srcLocType, locationId: srcLoc, productName: input.productName, batchNo: batchNo || '', expiryDate });
  }
  if (dstLocType && dstLoc) {
    recomputeTargets.push({ locationType: dstLocType, locationId: dstLoc, productName: input.productName, batchNo: batchNo || '', expiryDate });
  }

  return { movementId: id, recomputeTargets };
}

/**
 * Calculate opening stock for a location+product+batch before a given date.
 */
export async function getOpeningStock(params) {
  const { locationType, locationId, productName, batchNo, startDate } = params;

  const result = await query(
    `SELECT movement_type, quantity, source_location, destination_location,
            source_location_type, destination_location_type
     FROM stock_movements
     WHERE status = 'posted'
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($1))
       AND COALESCE(batch_no, '') = $2
       AND created_at < $3::timestamp`,
    [productName, batchNo || '', startDate]
  );

  let inward = 0;
  let outward = 0;

  for (const m of result.rows) {
    const srcType = m.source_location_type || inferLocationType(m.source_location);
    const dstType = m.destination_location_type || inferLocationType(m.destination_location);

    if (dstType === locationType && m.destination_location === locationId && INWARD_TYPES.has(m.movement_type)) {
      inward += Number(m.quantity || 0);
    }
    if (srcType === locationType && m.source_location === locationId && OUTWARD_TYPES.has(m.movement_type)) {
      outward += Number(m.quantity || 0);
    }
  }

  return inward - outward;
}

/**
 * Calculate inward and outward movement totals for a location within a date range.
 */
export async function getMovementTotals(params) {
  const { locationType, locationId, productName, startDate, endDate } = params;

  const result = await query(
    `SELECT movement_type, quantity, source_location, destination_location,
            source_location_type, destination_location_type
     FROM stock_movements
     WHERE status = 'posted'
       AND ($1::text IS NULL OR LOWER(TRIM(product_name)) = LOWER(TRIM($1)))
       AND created_at >= $2::timestamp
       AND created_at <= $3::timestamp
       AND (
         source_location = $5 OR destination_location = $5
       )`,
    [productName || null, startDate, endDate, locationType, locationId]
  );

  let inwardQty = 0;
  let outwardQty = 0;

  for (const m of result.rows) {
    const srcType = m.source_location_type || inferLocationType(m.source_location);
    const dstType = m.destination_location_type || inferLocationType(m.destination_location);

    if (dstType === locationType && m.destination_location === locationId && INWARD_TYPES.has(m.movement_type)) {
      inwardQty += Number(m.quantity || 0);
    }
    if (srcType === locationType && m.source_location === locationId && OUTWARD_TYPES.has(m.movement_type)) {
      outwardQty += Number(m.quantity || 0);
    }
  }

  return { inwardQty, outwardQty };
}

/**
 * Get closing stock from the inventory_balances cache.
 */
export async function getClosingStock(params) {
  const { locationType, locationId, productName, batchNo, expiryDate } = params;
  const row = await getOne(
    `SELECT closing_qty FROM inventory_balances
     WHERE location_type = $1
       AND location_id = $2
       AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
       AND COALESCE(batch_no, '') = $4
       AND (expiry_date IS NOT DISTINCT FROM $5::date)`,
    [locationType, locationId, productName, batchNo || '', expiryDate || null]
  );
  return Number(row?.closing_qty ?? 0);
}

/**
 * Recompute ALL inventory_balances for a given location by re-reading all
 * stock_movements for that location. Useful after batch writes.
 *
 * @param {string} locationType - 'branch' | 'warehouse' | 'country' | 'in_transit'
 * @param {string} locationId   - e.g. 'oshakati_branch'
 */
export async function recomputeLocationBalances(locationType, locationId) {
  const result = await query(
    `SELECT DISTINCT product_name, COALESCE(batch_no,'') as batch_no, expiry_date
     FROM stock_movements
     WHERE status = 'posted'
       AND (
         (source_location_type = $1 AND source_location = $2)
         OR (destination_location_type = $1 AND destination_location = $2)
         OR (source_location_type IS NULL AND source_location = $2)
         OR (destination_location_type IS NULL AND destination_location = $2)
       )`,
    [locationType, locationId]
  );

  for (const r of result.rows) {
    try {
      await recomputeInventoryBalance({
        locationType,
        locationId,
        productName: r.product_name,
        batchNo: r.batch_no,
        expiryDate: r.expiry_date,
      });
    } catch (err) {
      console.error(`[stockEngine] recomputeLocationBalances error for ${locationId}/${r.product_name}:`, err.message);
    }
  }
}

/**
 * Seed or reseed inventory_balances from all existing stock_movements.
 * Extracts unique (productName, batchNo, location) combos and recomputes each.
 */
export async function seedInventoryBalances() {
  const result = await query(
    `SELECT product_name, COALESCE(batch_no,'') as batch_no,
       source_location, source_location_type,
       destination_location, destination_location_type,
       expiry_date
     FROM stock_movements
     WHERE status = 'posted' AND product_name IS NOT NULL`
  );

  const seen = new Map();
  const targets = [];

  for (const r of result.rows) {
    // Source location
    const srcType = r.source_location_type || inferLocationType(r.source_location);
    if (srcType && r.source_location) {
      const k = `${srcType}|${r.source_location}|${r.product_name}|${r.batch_no}`;
      if (!seen.has(k)) {
        seen.set(k, r.expiry_date || null);
        targets.push({
          locationType: srcType,
          locationId: r.source_location,
          productName: r.product_name,
          batchNo: r.batch_no,
          expiryDate: r.expiry_date || null,
        });
      } else if (!seen.get(k) && r.expiry_date) {
        seen.set(k, r.expiry_date);
        const target = targets.find(
          t => t.locationType === srcType && t.locationId === r.source_location &&
               t.productName === r.product_name && t.batchNo === r.batch_no
        );
        if (target) target.expiryDate = r.expiry_date;
      }
    }
    // Destination location
    const dstType = r.destination_location_type || inferLocationType(r.destination_location);
    if (dstType && r.destination_location) {
      const k = `${dstType}|${r.destination_location}|${r.product_name}|${r.batch_no}`;
      if (!seen.has(k)) {
        seen.set(k, r.expiry_date || null);
        targets.push({
          locationType: dstType,
          locationId: r.destination_location,
          productName: r.product_name,
          batchNo: r.batch_no,
          expiryDate: r.expiry_date || null,
        });
      } else if (!seen.get(k) && r.expiry_date) {
        seen.set(k, r.expiry_date);
        const target = targets.find(
          t => t.locationType === dstType && t.locationId === r.destination_location &&
               t.productName === r.product_name && t.batchNo === r.batch_no
        );
        if (target) target.expiryDate = r.expiry_date;
      }
    }
  }

  let seeded = 0;
  let errors = 0;
  for (const target of targets) {
    try {
      await recomputeInventoryBalance(target);
      seeded++;
    } catch (err) {
      console.error(`[stockEngine] Seed error for ${target.locationId}/${target.productName}:`, err.message);
      errors++;
    }
  }

  return { seeded, errors, total: targets.length };
}
