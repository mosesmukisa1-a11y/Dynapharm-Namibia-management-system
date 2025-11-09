import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function generateSaleId(prefix = 'WALK') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeSaleRow(row) {
  if (!row) return null;

  const data = safeJsonParse(row.data, {});
  const items = safeJsonParse(row.items, data.products || []);
  const metadata = safeJsonParse(row.metadata, data.metadata || null);

  const saleDate = row.sale_date instanceof Date ? row.sale_date.toISOString() : row.sale_date || data.timestamp;
  const subtotal = Number(row.subtotal ?? data.subtotal ?? data.total ?? 0);
  const total = Number(row.total ?? data.total ?? data.totalAmount ?? subtotal);
  const totalBV = Number(row.total_bv ?? data.totalBV ?? 0);
  const tax = Number(row.tax ?? data.tax ?? 0);
  const discount = Number(row.discount ?? data.discount ?? 0);

  const base = {
    id: row.id || data.id || generateSaleId(),
    saleNumber: row.sale_number || data.saleNumber || row.id || data.id,
    timestamp: saleDate ? new Date(saleDate).toISOString() : new Date().toISOString(),
    branch: row.branch_id || data.branch || data.branchId || null,
    branchId: row.branch_id || data.branch || data.branchId || null,
    customerName: row.customer_name || data.customerName || '',
    phone: row.customer_phone || data.phone || data.customerPhone || '',
    email: row.customer_email || data.email || data.customerEmail || '',
    customerType: row.customer_type || data.customerType || 'customer',
    paymentMethod: row.payment_method || data.paymentMethod || 'cash',
    subtotal,
    discount,
    tax,
    total,
    totalAmount: total,
    totalBV,
    status: row.status || data.status || 'completed',
    products: Array.isArray(items) ? items : [],
    distributorReferral: data.distributorReferral || metadata?.distributorReferral || null,
    clientId: data.clientId || data.client_id || null,
    clientReferenceNumber: data.clientReferenceNumber || data.client_reference_number || null,
    soldBy: data.soldBy || row.created_by || null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || data.createdAt || null,
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || data.updatedAt || null,
    metadata: metadata || null,
  };

  return {
    ...data,
    ...base,
    total,
    subtotal,
    tax,
    discount,
    totalBV,
    products: base.products,
    timestamp: base.timestamp,
  };
}

function buildSaleRecord(payload, existing = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Sale payload is required');
  }

  const id = payload.id || existing.id || generateSaleId();
  const branchId = payload.branch || payload.branchId || existing.branch_id;
  if (!branchId) {
    throw new Error('branchId is required');
  }

  const saleDate =
    parseDate(payload.timestamp || payload.saleDate) ||
    existing.sale_date ||
    new Date().toISOString();

  const subtotal = Number(payload.subtotal ?? payload.total ?? existing.subtotal ?? 0);
  const total = Number(payload.total ?? payload.totalAmount ?? subtotal);
  const totalBV = Number(payload.totalBV ?? existing.total_bv ?? 0);
  const tax = Number(payload.tax ?? existing.tax ?? 0);
  const discount = Number(payload.discount ?? existing.discount ?? 0);
  const payment = payload.paymentMethod || existing.payment_method || 'cash';

  const products = Array.isArray(payload.products) ? payload.products : Array.isArray(payload.items) ? payload.items : [];

  return {
    id,
    branch_id: branchId,
    sale_number: payload.saleNumber || existing.sale_number || id,
    sale_date: saleDate,
    customer_name: payload.customerName || existing.customer_name || null,
    customer_phone: payload.phone || payload.customerPhone || existing.customer_phone || null,
    customer_email: payload.email || payload.customerEmail || existing.customer_email || null,
    customer_type: payload.customerType || existing.customer_type || 'customer',
    payment_method: payment,
    subtotal,
    discount,
    tax,
    total,
    total_bv: totalBV,
    status: payload.status || existing.status || 'completed',
    items: JSON.stringify(products),
    data: JSON.stringify({ ...payload, id }),
    metadata: JSON.stringify({
      distributorReferral: payload.distributorReferral || null,
      referralId:
        payload.distributorReferral?.id ||
        payload.referralId ||
        existing.metadata?.referralId ||
        null,
      referralName:
        payload.distributorReferral?.name ||
        payload.referralName ||
        existing.metadata?.referralName ||
        null,
      notes: payload.notes || existing.metadata?.notes || null,
    }),
    created_by: payload.soldBy || existing.created_by || null,
    updated_at: new Date().toISOString(),
  };
}

function buildSelectQuery(searchParams) {
  const conditions = [];
  const params = [];

  const branch = searchParams.get('branch');
  if (branch) {
    params.push(branch);
    conditions.push(`branch_id = $${params.length}`);
  }

  const from = searchParams.get('from');
  if (from) {
    const fromDate = parseDate(from);
    if (fromDate) {
      params.push(fromDate);
      conditions.push(`sale_date >= $${params.length}`);
    }
  }

  const to = searchParams.get('to');
  if (to) {
    const toDate = parseDate(to);
    if (toDate) {
      params.push(toDate);
      conditions.push(`sale_date <= $${params.length}`);
    }
  }

  const search = searchParams.get('search');
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`LOWER(customer_name) LIKE $${params.length}`);
  }

  let queryText = 'SELECT * FROM branch_walkin_sales';
  if (conditions.length > 0) {
    queryText += ` WHERE ${conditions.join(' AND ')}`;
  }
  queryText += ' ORDER BY sale_date DESC, created_at DESC LIMIT 250';

  return { queryText, params };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const id = searchParams.get('id');

  try {
    if (req.method === 'GET') {
      if (id) {
        const row = await getOne('SELECT * FROM branch_walkin_sales WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Sale not found' });
        }
        return res.status(200).json({ success: true, sale: normalizeSaleRow(row) });
      }

      const { queryText, params } = buildSelectQuery(searchParams);
      const rows = await getMany(queryText, params);
      return res.status(200).json({
        success: true,
        sales: rows.map(normalizeSaleRow).filter(Boolean),
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;
      const record = buildSaleRecord(salePayload);

      const columns = Object.keys(record);
      const values = Object.values(record);
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const columnNames = columns.map((col) => `"${col}"`).join(', ');

      const result = await query(
        `INSERT INTO branch_walkin_sales (${columnNames}) VALUES (${placeholders}) RETURNING *`,
        values,
      );

      return res.status(201).json({
        success: true,
        sale: normalizeSaleRow(result.rows[0]),
      });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;
      const targetId = salePayload.id || id;

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Sale id is required' });
      }

      const existing = await getOne('SELECT * FROM branch_walkin_sales WHERE id = $1', [targetId]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Sale not found' });
      }

      const record = buildSaleRecord(salePayload, existing);
      const columns = Object.keys(record);
      const values = Object.values(record);
      const setClause = columns.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');

      const result = await query(
        `UPDATE branch_walkin_sales SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
        [...values, targetId],
      );

      return res.status(200).json({
        success: true,
        sale: normalizeSaleRow(result.rows[0]),
      });
    }

    if (req.method === 'DELETE') {
      const targetId = id;
      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Sale id is required' });
      }

      const result = await query('DELETE FROM branch_walkin_sales WHERE id = $1 RETURNING *', [targetId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Sale not found' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Walk-in sales API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

