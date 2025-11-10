import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRange({ startParam, endParam, yearParam, monthParam }) {
  const start = parseDate(startParam);
  const end = parseDate(endParam);

  if (start && end) {
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (yearParam && monthParam) {
    const year = Number(yearParam);
    const month = Number(monthParam);
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
    }
  }

  const defaultEnd = end || new Date();
  const defaultStart = start || new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: defaultStart.toISOString(), end: defaultEnd.toISOString() };
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    branch: row.branch_id || row.branch || 'unknown',
    productName: row.product_name || 'Unknown Product',
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0),
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
    const scope = searchParams.get('scope') || 'range';
    const branchParam = searchParams.get('branch');
    const range = buildRange({
      startParam: searchParams.get('start'),
      endParam: searchParams.get('end'),
      yearParam: searchParams.get('year'),
      monthParam: searchParams.get('month'),
    });

    const params = [range.start, range.end];
    let queryText = `
      SELECT
        s.branch_id,
        COALESCE(
          item.value->>'productName',
          item.value->>'name',
          item.value->>'product',
          item.value->>'sku',
          'Unknown Product'
        ) AS product_name,
        SUM(
          COALESCE(
            NULLIF(item.value->>'quantity', '')::numeric,
            0
          )
        ) AS quantity,
        SUM(
          COALESCE(
            NULLIF(item.value->>'amount', '')::numeric,
            NULLIF(item.value->>'total', '')::numeric,
            (
              COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 0) *
              COALESCE(NULLIF(item.value->>'unitPrice', '')::numeric, NULLIF(item.value->>'price', '')::numeric, 0)
            )
          )
        ) AS amount
      FROM branch_walkin_sales s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS item(value)
      WHERE s.sale_date BETWEEN $1 AND $2
    `;

    if (branchParam && branchParam !== 'all') {
      params.push(branchParam);
      queryText += ` AND s.branch_id = $${params.length}`;
    }

    queryText += `
      GROUP BY s.branch_id, product_name
      ORDER BY s.branch_id, product_name
      LIMIT 2000
    `;

    const rows = await getMany(queryText, params);
    const normalized = rows.map(normalizeRow).filter(Boolean);

    return res.status(200).json({
      success: true,
      rows: normalized,
      range,
      scope,
    });
  } catch (error) {
    console.error('MIS stock API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}


