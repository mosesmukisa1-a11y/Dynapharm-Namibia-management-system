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

    const params = [];
    const where = [];

    if (dateParam) {
      const parsed = parseDate(dateParam);
      if (!parsed) {
        return res.status(400).json({ success: false, error: 'Invalid date parameter' });
      }
      where.push(`sale_date::date = $${params.length + 1}`);
      params.push(parsed.toISOString().slice(0, 10));
    } else {
      const start = parseDate(startParam);
      const end = parseDate(endParam);
      if (start && end) {
        where.push(`sale_date BETWEEN $${params.length + 1} AND $${params.length + 2}`);
        params.push(start.toISOString(), end.toISOString());
      } else if (start) {
        where.push(`sale_date >= $${params.length + 1}`);
        params.push(start.toISOString());
      } else if (end) {
        where.push(`sale_date <= $${params.length + 1}`);
        params.push(end.toISOString());
      } else {
        // default: last 7 days
        where.push(`sale_date >= NOW() - INTERVAL '7 days'`);
      }
    }

    if (branchParam && branchParam !== 'all') {
      where.push(`branch_id = $${params.length + 1}`);
      params.push(branchParam);
    }

    let queryText = `
      SELECT *
      FROM branch_walkin_sales
    `;
    if (where.length > 0) {
      queryText += ` WHERE ${where.join(' AND ')}`;
    }
    queryText += ` ORDER BY sale_date DESC LIMIT 1000`;

    const rows = await getMany(queryText, params);
    const receipts = rows.map(normalizeReceipt).filter(Boolean);
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


