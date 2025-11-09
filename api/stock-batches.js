import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';
function normalizeInboundPayload(payload) {
  if (!payload) return null;
  return {
    id: payload.id || payload.batchId || null,
    barcode: payload.barcode || null,
    cartonNo: payload.cartonNo || payload.carton_no || null,
    description: payload.description || payload.product || payload.productName || '',
    batchNo: payload.batchNo || payload.batch_no || null,
    expiryDate: payload.expiryDate || payload.expiry_date || null,
    quantity: payload.quantity ?? payload.totalQuantity ?? payload.remainingQuantity ?? 0,
    totalCtns: payload.totalCtns ?? payload.total_ctns ?? payload.totalQuantity ?? payload.quantity ?? 0,
    location: payload.location || payload.sourceWarehouseId || payload.warehouseId || payload.warehouse_id || 'country_stock',
    dispatchedQuantity: payload.dispatchedQuantity ?? payload.dispatched_quantity ?? 0,
    remainingQuantity: payload.remainingQuantity ?? payload.remaining_quantity ?? payload.quantity ?? 0,
    status: payload.status || 'available',
    productId: payload.productId || payload.product_id || null,
    warehouseId: payload.warehouseId || payload.warehouse_id || payload.sourceWarehouseId || null,
    metadata: payload.metadata || null
  };
}

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch (error) {
        throw new Error('Invalid JSON payload');
      }
    }
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

function toDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  if (/^\d{4}\/\d{2}$/.test(trimmed)) {
    return `${trimmed.replace('/', '-')}-01`;
  }
  if (/^\d{2}[-/]\d{4}$/.test(trimmed)) {
    const [month, year] = trimmed.split(/[-/]/);
    return `${year}-${month}-01`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    barcode: row.barcode,
    cartonNo: row.carton_no,
    description: row.description,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date ? row.expiry_date.toISOString().slice(0, 10) : null,
    quantity: row.quantity,
    totalCtns: row.total_ctns,
    importDate: row.import_date ? row.import_date.toISOString() : null,
    location: row.location,
    status: row.status,
    dispatchedQuantity: row.dispatched_quantity,
    remainingQuantity: row.remaining_quantity,
    productId: row.product_id,
    warehouseId: row.warehouse_id
  };
}

async function upsertBatch(batch) {
  const id = batch.id || generateId('BATCH');
  const barcode = batch.barcode || generateId('BC');
  const quantity = Number.parseInt(batch.quantity, 10);
  const remaining =
    batch.remainingQuantity !== undefined ? Number.parseInt(batch.remainingQuantity, 10) : quantity;

  const result = await query(
    `
    INSERT INTO stock_batches (
      id, barcode, carton_no, description, batch_no, expiry_date,
      quantity, total_ctns, import_date, location, status,
      dispatched_quantity, remaining_quantity, product_id, warehouse_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, COALESCE($9, NOW()), $10, COALESCE($11, 'available'),
      COALESCE($12, 0), $13, $14, $15
    )
    ON CONFLICT (barcode) DO UPDATE SET
      carton_no = EXCLUDED.carton_no,
      description = EXCLUDED.description,
      batch_no = EXCLUDED.batch_no,
      expiry_date = EXCLUDED.expiry_date,
      quantity = EXCLUDED.quantity,
      total_ctns = EXCLUDED.total_ctns,
      import_date = EXCLUDED.import_date,
      location = EXCLUDED.location,
      status = EXCLUDED.status,
      dispatched_quantity = EXCLUDED.dispatched_quantity,
      remaining_quantity = EXCLUDED.remaining_quantity,
      product_id = EXCLUDED.product_id,
      warehouse_id = EXCLUDED.warehouse_id,
      updated_at = NOW()
    RETURNING *
  `,
    [
      id,
      barcode,
      batch.cartonNo || batch.carton_no || null,
      batch.description || null,
      batch.batchNo || batch.batch_no || null,
      toDate(batch.expiryDate || batch.expiry_date),
      Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      batch.totalCtns || batch.total_ctns || quantity || 0,
      batch.importDate || batch.import_date || null,
      batch.location || batch.sourceWarehouseId || batch.warehouseId || null,
      batch.status || null,
      batch.dispatchedQuantity || batch.dispatched_quantity || 0,
      Number.isFinite(remaining) && remaining >= 0 ? remaining : quantity || 0,
      batch.productId || batch.product_id || null,
      batch.warehouseId || batch.warehouse_id || batch.sourceWarehouseId || null
    ]
  );

  return normalizeBatch(result.rows[0]);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const barcode = searchParams.get('barcode');
  const location = searchParams.get('location');

  try {
    if (req.method === 'GET') {
      if (id) {
        const batch = await getOne('SELECT * FROM stock_batches WHERE id = $1', [id]);
        if (!batch) {
          return res.status(404).json({ success: false, error: 'Not found' });
        }
        return res.status(200).json(normalizeBatch(batch));
      }

      if (barcode) {
        const batch = await getOne('SELECT * FROM stock_batches WHERE barcode = $1', [barcode]);
        if (!batch) {
          return res.status(404).json({ success: false, error: 'Not found' });
        }
        return res.status(200).json(normalizeBatch(batch));
      }

      let queryText = 'SELECT * FROM stock_batches';
      const params = [];

      if (location) {
        queryText += ' WHERE location = $1';
        params.push(location);
      }

      queryText += ' ORDER BY import_date DESC';
      const rows = await getMany(queryText, params);
      return res.status(200).json(rows.map(normalizeBatch).filter(Boolean));
    }

    if (req.method === 'POST') {
      const body = await parseRequestBody(req);
      if (Array.isArray(body)) {
        const results = [];
        for (const item of body) {
          try {
            const batch = await upsertBatch(item);
            results.push(batch);
          } catch (error) {
            console.error('Error importing stock batch:', error);
          }
        }
        return res.status(201).json({ success: true, count: results.length, batches: results });
      }

      const batch = await upsertBatch(body);
      const input = normalizeInboundPayload(body);
      const batch = await upsertBatch(input);
      return res.status(201).json({ success: true, batch });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body?.id && !body?.barcode) {
        return res.status(400).json({ success: false, error: 'id or barcode required' });
      }

      const identifier = body.id
        ? { column: 'id', value: body.id }
        : { column: 'barcode', value: body.barcode };

      const existing = await getOne(
        `SELECT * FROM stock_batches WHERE ${identifier.column} = $1`,
        [identifier.value]
      );
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }

      const batch = await upsertBatch({ ...existing, ...body });
      return res.status(200).json({ success: true, batch });
    }

    if (req.method === 'DELETE') {
      if (!id && !barcode) {
        return res.status(400).json({ success: false, error: 'id or barcode required' });
      }
      const identifier = id ? { column: 'id', value: id } : { column: 'barcode', value: barcode };
      await query(`DELETE FROM stock_batches WHERE ${identifier.column} = $1`, [identifier.value]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock batches API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

