import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function normalizeReceipt(row) {
  if (!row) return null;
  const total = Number(row.total || row.total_amount || 0);
  const subtotal = Number(row.subtotal || 0);
  const discount = Number(row.discount || 0);
  const tax = Number(row.tax || 0);
  const items = normalizeItems(row.items);
  const saleDate =
    row.sale_date instanceof Date
      ? row.sale_date.toISOString()
      : typeof row.sale_date === 'string'
      ? row.sale_date
      : row.created_at instanceof Date
      ? row.created_at.toISOString()
      : null;
  const saleDateObj = saleDate ? new Date(saleDate) : null;
  return {
    id: row.id,
    saleNumber: row.sale_number,
    receiptNumber: row.sale_number || row.id,
    branchId: row.branch_id,
    branch: row.branch_id,
    customerName: row.customer_name,
    clientName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerType: row.customer_type,
    paymentMethod: row.payment_method,
    type: row.customer_type || row.payment_method || 'walk-in',
    subtotal,
    discount,
    tax,
    total,
    totalAmount: total,
    totalBV: Number(row.total_bv || 0),
    status: row.status || 'completed',
    saleDate,
    date: saleDateObj ? saleDateObj.toISOString().slice(0, 10) : '',
    timestamp: saleDateObj ? saleDateObj.toISOString() : new Date().toISOString(),
    createdAt: row.created_at,
    source: row.source || 'walkin',
    items: items.map((item) => ({
      productName: item.productName || item.name || item.product || '',
      productCode: item.productCode || item.sku || '',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || item.price || 0),
      amount: Number(item.amount || item.total || (item.quantity || 0) * (item.unitPrice || item.price || 0)),
    })),
    products: items.map((item) => ({
      name: item.productName || item.name || item.product || '',
      sku: item.productCode || item.sku || '',
      quantity: Number(item.quantity || 0),
      amount: Number(item.amount || item.total || (item.quantity || 0) * (item.unitPrice || item.price || 0)),
    })),
    data: typeof row.data === 'object' && row.data !== null ? row.data : row.data ? (() => {
      try { return JSON.parse(row.data); } catch { return {}; }
    })() : {},
  };
}

function summarizeReceipts(receipts) {
  const summary = {
    count: receipts.length,
    totalAmount: 0,
    branches: new Map(),
  };
  receipts.forEach((receipt) => {
    summary.totalAmount += Number(receipt.total || 0);
    const key = receipt.branchId || 'unknown';
    if (!summary.branches.has(key)) {
      summary.branches.set(key, {
        branch: key,
        count: 0,
        total: 0,
      });
    }
    const branchSummary = summary.branches.get(key);
    branchSummary.count += 1;
    branchSummary.total += Number(receipt.total || 0);
  });
  summary.branchBreakdown = Array.from(summary.branches.values()).sort((a, b) =>
    a.branch.localeCompare(b.branch)
  );
  return summary;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const dateParam = searchParams.get('date');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const branchParam = searchParams.get('branch');
    const qParam = searchParams.get('q');

    // ── Walk-in sales query ───────────────────────────────────────────────────
    const walkinParams = [];
    const walkinWhere = [];

    if (dateParam) {
      const parsed = parseDate(dateParam);
      if (!parsed) {
        return res.status(400).json({ success: false, error: 'Invalid date parameter' });
      }
      walkinWhere.push(`sale_date::date = $${walkinParams.length + 1}`);
      walkinParams.push(parsed.toISOString().slice(0, 10));
    } else {
      const start = parseDate(startParam);
      const end = parseDate(endParam);
      if (start && end) {
        walkinWhere.push(`sale_date BETWEEN $${walkinParams.length + 1} AND $${walkinParams.length + 2}`);
        walkinParams.push(start.toISOString(), end.toISOString());
      } else if (start) {
        walkinWhere.push(`sale_date >= $${walkinParams.length + 1}`);
        walkinParams.push(start.toISOString());
      } else if (end) {
        walkinWhere.push(`sale_date <= $${walkinParams.length + 1}`);
        walkinParams.push(end.toISOString());
      } else {
        walkinWhere.push(`sale_date >= NOW() - INTERVAL '7 days'`);
      }
    }

    if (branchParam && branchParam !== 'all') {
      walkinWhere.push(`branch_id = $${walkinParams.length + 1}`);
      walkinParams.push(branchParam);
    }

    if (qParam && qParam.trim()) {
      const like = `%${qParam.trim()}%`;
      walkinParams.push(like);
      walkinWhere.push(`(sale_number ILIKE $${walkinParams.length} OR customer_name ILIKE $${walkinParams.length} OR customer_phone ILIKE $${walkinParams.length})`);
    }

    let walkinQuery = `
      SELECT id, sale_number, branch_id, customer_name, customer_phone, customer_email,
             customer_type, payment_method, total, subtotal, discount, tax, total_bv,
             sale_date, created_at, status, items, data, 'walkin' AS source
      FROM branch_walkin_sales
    `;
    if (walkinWhere.length > 0) {
      walkinQuery += ` WHERE ${walkinWhere.join(' AND ')}`;
    }
    walkinQuery += ` ORDER BY sale_date DESC LIMIT 1000`;

    // ── Prescription dispensing query ─────────────────────────────────────────
    const rxParams = [];
    const rxWhere = [`bat.activity_type = 'prescription_dispensing'`];

    if (dateParam) {
      const parsed = parseDate(dateParam);
      if (parsed) {
        rxParams.push(parsed.toISOString().slice(0, 10));
        rxWhere.push(`bat.service_date::date = $${rxParams.length}`);
      }
    } else {
      const start = parseDate(startParam);
      const end = parseDate(endParam);
      if (start && end) {
        rxParams.push(start.toISOString(), end.toISOString());
        rxWhere.push(`bat.service_date BETWEEN $${rxParams.length - 1} AND $${rxParams.length}`);
      } else if (start) {
        rxParams.push(start.toISOString());
        rxWhere.push(`bat.service_date >= $${rxParams.length}`);
      } else if (end) {
        rxParams.push(end.toISOString());
        rxWhere.push(`bat.service_date <= $${rxParams.length}`);
      } else {
        rxWhere.push(`bat.service_date >= NOW() - INTERVAL '7 days'`);
      }
    }

    if (branchParam && branchParam !== 'all') {
      rxParams.push(branchParam);
      rxWhere.push(`bat.branch_id = $${rxParams.length}`);
    }

    if (qParam && qParam.trim()) {
      const like = `%${qParam.trim()}%`;
      rxParams.push(like);
      rxWhere.push(`(bat.form_reference_id ILIKE $${rxParams.length} OR bat.client_name ILIKE $${rxParams.length})`);
    }

    // One row per prescription (deduplicate by form_reference_id — one activity record per dispense event)
    const rxQuery = `
      SELECT
        bat.id                                                   AS id,
        'RX-' || bat.form_reference_id                          AS sale_number,
        bat.branch_id                                            AS branch_id,
        bat.client_name                                          AS customer_name,
        bat.client_phone                                         AS customer_phone,
        NULL::text                                               AS customer_email,
        'prescription'                                           AS customer_type,
        bat.payment_method                                       AS payment_method,
        bat.grand_total                                          AS total,
        bat.product_total_dp                                     AS subtotal,
        0                                                        AS discount,
        0                                                        AS tax,
        0                                                        AS total_bv,
        bat.service_date                                         AS sale_date,
        bat.created_at                                           AS created_at,
        'completed'                                              AS status,
        '[]'::text                                               AS items,
        NULL                                                     AS data,
        'prescription'                                           AS source
      FROM branch_activity_transactions bat
      WHERE ${rxWhere.join(' AND ')}
      ORDER BY bat.service_date DESC
      LIMIT 1000
    `;

    const [walkinRows, rxRows] = await Promise.all([
      getMany(walkinQuery, walkinParams),
      getMany(rxQuery, rxParams),
    ]);

    const allRows = [...walkinRows, ...rxRows];

    // Sort combined results by sale_date descending
    allRows.sort((a, b) => {
      const da = new Date(a.sale_date || a.created_at || 0);
      const db = new Date(b.sale_date || b.created_at || 0);
      return db - da;
    });

    const receipts = allRows.slice(0, 1000).map(normalizeReceipt).filter(Boolean);
    const totals = summarizeReceipts(receipts);

    return res.status(200).json({
      success: true,
      receipts,
      totals,
    });
  } catch (error) {
    console.error('MIS receipts API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}
