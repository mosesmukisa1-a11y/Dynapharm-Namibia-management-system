import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';

function normalizeMovement(row) {
  if (!row) return null;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: row.id,
    warehouseId: row.warehouse_id, warehouse_id: row.warehouse_id,
    inventoryId: row.inventory_id, inventory_id: row.inventory_id,
    productId: row.product_id, product_id: row.product_id,
    productName: row.product_name, product_name: row.product_name,
    batchNo: row.batch_no, batch_no: row.batch_no,
    movementType: row.movement_type, movement_type: row.movement_type,
    quantity: Number(row.quantity || 0),
    balanceAfter: row.balance_after !== null ? Number(row.balance_after) : null,
    reference: row.reference || '',
    referenceId: row.reference_id || row.reference || '', reference_id: row.reference_id || row.reference || '',
    sourceLocation: row.source_location || '', source_location: row.source_location || '',
    destinationLocation: row.destination_location || '', destination_location: row.destination_location || '',
    location: row.location || row.source_location || '',
    notes: row.notes || '',
    metadata: row.metadata || null,
    createdBy: row.created_by || '', created_by: row.created_by || '',
    createdAt: createdAt, created_at: createdAt,
    status: row.status || null,
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const warehouseId = url.searchParams.get('warehouse');
      const productId = url.searchParams.get('product');
      const branch = url.searchParams.get('branch');
      const movementType = url.searchParams.get('type');
      const dateFrom = url.searchParams.get('date_from');
      const dateTo = url.searchParams.get('date_to');
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const safeLimit = Number.isNaN(limit) ? 100 : Math.min(limit, 2000);

      let rows;
      if (warehouseId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE warehouse_id = $1 ORDER BY created_at DESC LIMIT $2',
          [warehouseId, safeLimit]
        );
      } else if (productId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2',
          [productId, safeLimit]
        );
      } else if (!branch) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements ORDER BY created_at DESC LIMIT $1',
          [safeLimit]
        );
      } else {
        rows = [];
      }

      let branchMovements = [];
      try {
        let bmQuery = 'SELECT * FROM stock_movements';
        const bmParams = [];
        const bmWhere = [];
        if (branch) {
          bmParams.push(`%${branch}%`);
          bmWhere.push(`(LOWER(source_location) LIKE LOWER($${bmParams.length}) OR LOWER(destination_location) LIKE LOWER($${bmParams.length}))`);
        }
        if (movementType) {
          bmParams.push(movementType);
          bmWhere.push(`movement_type = $${bmParams.length}`);
        }
        if (dateFrom) {
          bmParams.push(dateFrom);
          bmWhere.push(`created_at >= $${bmParams.length}::timestamp`);
        }
        if (dateTo) {
          bmParams.push(dateTo + 'T23:59:59');
          bmWhere.push(`created_at <= $${bmParams.length}::timestamp`);
        }
        if (bmWhere.length > 0) bmQuery += ' WHERE ' + bmWhere.join(' AND ');
        bmParams.push(safeLimit);
        bmQuery += ` ORDER BY created_at DESC LIMIT $${bmParams.length}`;

        const bmRows = await getMany(bmQuery, bmParams);
        const fmtDt = (d) => d instanceof Date ? d.toISOString() : d;
        branchMovements = bmRows.map(r => ({
          id: r.id,
          productName: r.product_name, product_name: r.product_name,
          batchNo: r.batch_no, batch_no: r.batch_no,
          movementType: r.movement_type, movement_type: r.movement_type,
          quantity: Number(r.quantity || 0),
          location: r.source_location || r.destination_location || '',
          sourceLocation: r.source_location, source_location: r.source_location,
          destinationLocation: r.destination_location, destination_location: r.destination_location,
          referenceId: r.reference_id, reference_id: r.reference_id,
          notes: r.notes,
          saleType: r.sale_type || null, sale_type: r.sale_type || null,
          createdBy: r.created_by, created_by: r.created_by,
          createdAt: fmtDt(r.created_at), created_at: fmtDt(r.created_at),
          status: r.status || null,
        }));
      } catch {}

      const warehouseNormalized = rows.map(normalizeMovement).filter(Boolean);
      const combined = [...warehouseNormalized, ...branchMovements].sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || 0);
        const db = new Date(b.createdAt || b.created_at || 0);
        return db - da;
      }).slice(0, safeLimit);

      return res.json({ success: true, movements: combined, total: combined.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const movType = body.movementType || body.movement_type || body.type || 'adjustment';
      const productName = body.productName || body.product_name || '';
      const qty = Number(body.quantity || 0);
      const notes = body.notes || null;
      const createdBy = body.createdBy || body.created_by || null;

      if (['write_off', 'sale', 'return', 'field_use', 'received'].includes(movType)) {
        const id = `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const referenceId = body.reference_id || body.referenceId || null;
        const batchNo = body.batch_no || body.batchNo || null;
        const srcLoc = body.source_location || body.sourceLocation || null;
        const destLoc = body.destination_location || body.destinationLocation || null;
        await query(
          `INSERT INTO stock_movements (id, product_name, batch_no, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
          [id, productName, batchNo, qty, movType, srcLoc, destLoc, referenceId, notes, createdBy]
        );
        const branchId = srcLoc || destLoc;
        if (branchId && ['write_off', 'sale', 'field_use', 'return'].includes(movType)) {
          try {
            const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await query(
              `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
              [bimId, branchId, movType, productName, batchNo || '', qty, referenceId, notes, createdBy]
            );
          } catch (bimErr) {
            console.error('Branch movement mirror warning:', bimErr.message);
          }
        }
        return res.status(201).json({
          success: true,
          id, product_name: productName, productName, quantity: qty, movement_type: movType, movementType: movType,
          batch_no: batchNo, batchNo, notes, created_by: createdBy,
        });
      }

      const id = `WMOVE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const result = await query(
        `INSERT INTO warehouse_inventory_movements
          (id, warehouse_id, inventory_id, product_id, product_name, batch_no, movement_type, quantity, balance_after, reference, notes, metadata, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         RETURNING *`,
        [
          id,
          body.warehouseId || body.warehouse_id || null,
          body.inventoryId || body.inventory_id || null,
          body.productId || body.product_id || null,
          productName,
          body.batchNo || body.batch_no || null,
          movType,
          qty,
          body.balanceAfter !== undefined ? Number(body.balanceAfter) : null,
          body.reference || null,
          notes,
          body.metadata ? JSON.stringify(body.metadata) : null,
          createdBy,
        ]
      );

      return res.status(201).json(normalizeMovement(result.rows[0]));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock movements API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
