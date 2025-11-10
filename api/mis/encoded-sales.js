import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRange(startParam, endParam) {
  const start = parseDate(startParam);
  const end = parseDate(endParam);
  if (start && end) {
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (start) {
    const defaultEnd = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: defaultEnd.toISOString() };
  }
  if (end) {
    const defaultStart = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: defaultStart.toISOString(), end: end.toISOString() };
  }
  const defaultEnd = new Date();
  const defaultStart = new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: defaultStart.toISOString(), end: defaultEnd.toISOString() };
}

function normalizeRow(row) {
  if (!row) return null;
  const quantity = Number(row.quantity || 0);
  const unitPrice = Number(row.unit_price || 0);
  return {
    branch: row.branch_id || 'unknown',
    distributorName: row.distributor_name || '',
    sku: row.sku || '',
    productName: row.product_name || row.sku || 'Unknown Product',
    quantity,
    unitPrice,
    amount: Number(row.amount || quantity * unitPrice),
    status: row.status || 'draft',
  };
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
    const range = buildRange(searchParams.get('start'), searchParams.get('end'));
    const branchParam = searchParams.get('branch');

    const params = [range.start, range.end];
    let queryText = `
      SELECT
        branch_id,
        distributor_name,
        sku,
        product_name,
        SUM(quantity) AS quantity,
        AVG(unit_price) AS unit_price,
        SUM(quantity * unit_price) AS amount,
        status
      FROM mis_sales_lines
      WHERE sale_timestamp BETWEEN $1 AND $2
    `;

    if (branchParam && branchParam !== 'all') {
      params.push(branchParam);
      queryText += ` AND branch_id = $${params.length}`;
    }

    queryText += `
      GROUP BY branch_id, distributor_name, sku, product_name, status
      ORDER BY branch_id, product_name
      LIMIT 2000
    `;

    const rows = await getMany(queryText, params);
    return res.status(200).json({
      success: true,
      rows: rows.map(normalizeRow).filter(Boolean),
      range,
    });
  } catch (error) {
    console.error('MIS encoded-sales API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}


