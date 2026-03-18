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

      return res.json(rows.map(normalizeMovement).filter(Boolean));
    }

    if (req.method === 'POST') {
      const body = req.body || {};
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
          body.productName || body.product_name || '',
          body.batchNo || body.batch_no || null,
          body.movementType || body.movement_type || body.type || 'adjustment',
          Number(body.quantity || 0),
          body.balanceAfter !== undefined ? Number(body.balanceAfter) : null,
          body.reference || null,
          body.notes || null,
          body.metadata ? JSON.stringify(body.metadata) : null,
          body.createdBy || body.created_by || null,
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
