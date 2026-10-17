import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';
import { canReadCentralBatches } from './services/stockReportFreshness.js';
function normalizeInboundPayload(payload) {
  if (!payload) return null;
  return {
    id: payload.id || payload.batchId || null,
    barcode: payload.barcode || null,
    qrCode: payload.qr_code ?? payload.qrCode ?? null,
    cartonNo: payload.cartonNo || payload.carton_no || null,
    description: payload.description || payload.product_name || payload.product || payload.productName || '',
    batchNo: payload.batchNo || payload.batch_no || payload.batch_number || null,
    expiryDate: payload.expiryDate || payload.expiry_date || null,
    quantity: payload.quantity ?? payload.totalQuantity ?? payload.remainingQuantity ?? 0,
    totalCtns: payload.totalCtns ?? payload.total_ctns ?? payload.totalQuantity ?? payload.quantity ?? 0,
    location: payload.location || payload.sourceWarehouseId || payload.warehouseId || payload.warehouse_id || 'country_stock',
    dispatchedQuantity: payload.dispatchedQuantity ?? payload.dispatched_quantity ?? 0,
    remainingQuantity: payload.remainingQuantity ?? payload.remaining_quantity ?? payload.quantity ?? 0,
    status: payload.status || 'available',
    productId: payload.productId || payload.product_id || null,
    warehouseId: payload.warehouseId || payload.warehouse_id || payload.sourceWarehouseId || null,
    metadata: payload.metadata || null,
    unitPrice: payload.unit_price ?? payload.unitPrice ?? null,
    notes: payload.notes || null
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
  const expiryDate = row.expiry_date ?
  typeof row.expiry_date === 'string' ? row.expiry_date.slice(0, 10) : row.expiry_date.toISOString().slice(0, 10) :
  null;
  const importDate = row.import_date ?
  typeof row.import_date === 'string' ? row.import_date : row.import_date.toISOString() :
  null;
  const createdAt = row.created_at ?
  typeof row.created_at === 'string' ? row.created_at : row.created_at.toISOString() :
  importDate;
  return {
    id: row.id,
    barcode: row.barcode,
    qr_code: row.qr_code || null,
    cartonNo: row.carton_no,
    carton_no: row.carton_no,
    description: row.description,
    product_name: row.description,
    batchNo: row.batch_no,
    batch_no: row.batch_no,
    batch_number: row.batch_no,
    expiryDate: expiryDate,
    expiry_date: expiryDate,
    quantity: row.quantity,
    totalCtns: row.total_ctns,
    importDate: importDate,
    created_at: createdAt,
    location: row.location,
    status: row.status,
    dispatchedQuantity: row.dispatched_quantity,
    dispatched_quantity: row.dispatched_quantity,
    remainingQuantity: row.remaining_quantity,
    remaining_quantity: row.remaining_quantity,
    productId: row.product_id,
    product_id: row.product_id,
    warehouseId: row.warehouse_id,
    warehouse_id: row.warehouse_id,
    unit_price: row.unit_price || 0,
    cif_unit_cost: row.original_unit_cif ?? row.cif_unit_cost ?? null,
    dpc_unit_value: row.original_unit_dp ?? row.dpc_unit_value ?? null,
    notes: row.notes || null
  };
}

async function upsertBatch(batch) {
  const id = batch.id || generateId('BATCH');
  const barcode = batch.barcode || generateId('BC');
  const quantity = Number.parseInt(batch.quantity, 10);
  const remaining =
  batch.remainingQuantity !== undefined ? Number.parseInt(batch.remainingQuantity, 10) : quantity;

  const unitPrice = batch.unitPrice ?? batch.unit_price ?? 0;

  const result = await __qd_executePlan(query, __qd_registeredPlan("api/stock-batches.js:142:0"),































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
  batch.warehouseId || batch.warehouse_id || batch.sourceWarehouseId || null,
  Number(unitPrice) || 0,
  batch.notes || null]);



  return normalizeBatch(result.rows[0]);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!canReadCentralBatches(req.user)) return res.status(403).json({ success: false, error: 'Central warehouse batch access denied; use permitted branch inventory' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const barcode = searchParams.get('barcode');
  const location = searchParams.get('location');

  try {
    const expiryFallbackSelect = `
        SELECT sb.id, sb.barcode, sb.qr_code, sb.carton_no, sb.description, sb.batch_no,
               sb.expiry_date,
               sb.quantity, sb.total_ctns, sb.import_date, sb.location, sb.status,
               sb.dispatched_quantity, sb.remaining_quantity, sb.product_id,
               sb.warehouse_id, sb.unit_price, sb.cif_unit_cost, sb.dpc_unit_value,
               sb.original_unit_cif,sb.original_unit_dp,sb.metadata,sb.notes, sb.created_at, sb.updated_at
        FROM stock_batches sb
    `;

    if (req.method === 'GET') {
      if (id) {
        const batch = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock-batches.js:224:1"), [id]);
        if (!batch) {
          return res.status(404).json({ success: false, error: 'Not found' });
        }
        return res.status(200).json(normalizeBatch(batch));
      }

      if (barcode) {
        const batch = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock-batches.js:232:2"), [barcode]);
        if (!batch) {
          return res.status(404).json({ success: false, error: 'Not found' });
        }
        return res.status(200).json(normalizeBatch(batch));
      }

      let queryText = __qd_registeredPlan("api/stock-batches.js:239:3");
      const params = [];

      if (location) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/stock-batches.js:243:4")], "empty");
        params.push(location);
      }

      queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/stock-batches.js:247:5")], "empty");
      const rows = await __qd_executePlan(getMany, queryText, params);
      return res.status(200).json(rows.map(normalizeBatch).filter(Boolean));
    }

    if (req.method === 'POST') {
      return res.status(409).json({ success: false, error: 'Use import receiving with a stable receipt key and explicit units to create physical batches.' });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body.id && !body.barcode) return res.status(400).json({ success: false, error: 'id or barcode required' });
      const allowed = new Set(['id', 'barcode', 'qr_code', 'carton_no', 'cartonNo', 'notes']);
      if (Object.keys(body).some((key) => !allowed.has(key))) return res.status(409).json({ success: false,
        error: 'Received quantities, costs and lot identities are immutable. Use reviewed stock adjustments or a new receipt.' });
      const row = await __qd_executePlan(getOne, body.id ? __qd_registeredPlan("api/stock-batches.js:262:6") : __qd_registeredPlan("api/stock-batches.js:262:7"), [body.id || body.barcode]);
      if (!row) return res.status(404).json({ success: false, error: 'Not found' });
      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock-batches.js:264:8"),
      [row.id, body.barcode ?? row.barcode, body.qr_code === undefined ? row.qr_code : body.qr_code,
      body.cartonNo ?? body.carton_no ?? row.carton_no, body.notes ?? row.notes]);
      return res.json({ success: true, batch: normalizeBatch(updated) });
    }

    if (req.method === 'DELETE') return res.status(409).json({ success: false, error: 'Physical batches cannot be deleted. Use a reviewed stock correction.' });

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock batches API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
