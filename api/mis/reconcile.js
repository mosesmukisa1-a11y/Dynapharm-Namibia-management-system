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

function keyFor(branch, product) {
  return `${branch || 'unknown'}|${product || 'Unknown Product'}`.toLowerCase();
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = await (async () => {
      if (req.body && typeof req.body === 'object') return req.body;
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
    })();

    const range = buildRange(body.start, body.end);

    const [encodedRows, receiptRows] = await Promise.all([
      getMany(
        `
          SELECT
            branch_id,
            COALESCE(product_name, sku, 'Unknown Product') AS product_name,
            SUM(quantity) AS quantity,
            SUM(quantity * unit_price) AS amount
          FROM mis_sales_lines
          WHERE sale_timestamp BETWEEN $1 AND $2
          AND status = 'verified'
          GROUP BY branch_id, product_name, sku
        `,
        [range.start, range.end]
      ),
      getMany(
        `
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
              COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 0)
            ) AS quantity,
            SUM(
              COALESCE(
                NULLIF(item.value->>'amount', '')::numeric,
                NULLIF(item.value->>'total', '')::numeric,
                COALESCE(NULLIF(item.value->>'quantity', '')::numeric, 0) *
                COALESCE(NULLIF(item.value->>'unitPrice', '')::numeric, NULLIF(item.value->>'price', '')::numeric, 0)
              )
            ) AS amount
          FROM branch_walkin_sales s
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS item(value)
          WHERE s.sale_date BETWEEN $1 AND $2
          GROUP BY s.branch_id, product_name
        `,
        [range.start, range.end]
      ),
    ]);

    const map = new Map();

    encodedRows.forEach((row) => {
      const key = keyFor(row.branch_id, row.product_name);
      if (!map.has(key)) {
        map.set(key, {
          branch: row.branch_id || 'unknown',
          productName: row.product_name || 'Unknown Product',
          encodedQuantity: 0,
          encodedAmount: 0,
          receiptQuantity: 0,
          receiptAmount: 0,
        });
      }
      const entry = map.get(key);
      entry.encodedQuantity += Number(row.quantity || 0);
      entry.encodedAmount += Number(row.amount || 0);
    });

    receiptRows.forEach((row) => {
      const key = keyFor(row.branch_id, row.product_name);
      if (!map.has(key)) {
        map.set(key, {
          branch: row.branch_id || 'unknown',
          productName: row.product_name || 'Unknown Product',
          encodedQuantity: 0,
          encodedAmount: 0,
          receiptQuantity: 0,
          receiptAmount: 0,
        });
      }
      const entry = map.get(key);
      entry.receiptQuantity += Number(row.quantity || 0);
      entry.receiptAmount += Number(row.amount || 0);
    });

    const rows = Array.from(map.values()).map((entry) => {
      const diffAmount = entry.encodedAmount - entry.receiptAmount;
      return {
        ...entry,
        difference: diffAmount,
        status:
          Math.abs(diffAmount) < 1
            ? 'matched'
            : diffAmount > 0
            ? 'encoded-higher'
            : 'receipt-higher',
      };
    });

    return res.status(200).json({
      success: true,
      range,
      rows: rows.sort((a, b) => {
        const branchCompare = a.branch.localeCompare(b.branch);
        if (branchCompare !== 0) return branchCompare;
        return a.productName.localeCompare(b.productName);
      }),
    });
  } catch (error) {
    console.error('MIS reconcile API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}


