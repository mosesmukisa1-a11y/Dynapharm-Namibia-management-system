import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';

function normalizeMovement(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    inventoryId: row.inventory_id,
    productId: row.product_id,
    productName: row.product_name,
    batchNo: row.batch_no,
    movementType: row.movement_type,
    quantity: Number(row.quantity || 0),
    balanceAfter: row.balance_after !== null ? Number(row.balance_after) : null,
    reference: row.reference || '',
    notes: row.notes || '',
    metadata: row.metadata || null,
    createdBy: row.created_by || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
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
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);

      let rows;
      if (warehouseId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE warehouse_id = $1 ORDER BY created_at DESC LIMIT $2',
          [warehouseId, Number.isNaN(limit) ? 100 : limit]
        );
      } else if (productId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2',
          [productId, Number.isNaN(limit) ? 100 : limit]
        );
      } else {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements ORDER BY created_at DESC LIMIT $1',
          [Number.isNaN(limit) ? 100 : limit]
        );
      }

      let branchMovements = [];
      try {
        const bmRows = await getMany('SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT $1', [Number.isNaN(limit) ? 100 : limit]);
        branchMovements = bmRows.map(r => ({
          id: r.id,
          productName: r.product_name, product_name: r.product_name,
          movementType: r.movement_type, movement_type: r.movement_type,
          quantity: Number(r.quantity || 0),
          sourceLocation: r.source_location, source_location: r.source_location,
          destinationLocation: r.destination_location, destination_location: r.destination_location,
          referenceId: r.reference_id, reference_id: r.reference_id,
          notes: r.notes,
          createdBy: r.created_by, created_by: r.created_by,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        }));
      } catch {}

      const warehouseNormalized = rows.map(normalizeMovement).filter(Boolean);
      const combined = [...warehouseNormalized, ...branchMovements].sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || 0);
        const db = new Date(b.createdAt || b.created_at || 0);
        return db - da;
      }).slice(0, Number.isNaN(limit) ? 100 : limit);

      return res.json({ success: true, movements: combined });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const movType = body.movementType || body.movement_type || body.type || 'adjustment';
      const productName = body.productName || body.product_name || '';
      const qty = Number(body.quantity || 0);
      const notes = body.notes || null;
      const createdBy = body.createdBy || body.created_by || null;

      if (['write_off', 'sale', 'return', 'field_use'].includes(movType)) {
        const id = body.reference_id || body.referenceId || `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await query(
          `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
          [id, productName, qty, movType, body.source_location || body.sourceLocation || null, body.destination_location || body.destinationLocation || null, body.reference_id || body.referenceId || null, notes, createdBy]
        );
        return res.status(201).json({
          success: true,
          id, product_name: productName, productName, quantity: qty, movement_type: movType, movementType: movType,
          notes, created_by: createdBy,
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
