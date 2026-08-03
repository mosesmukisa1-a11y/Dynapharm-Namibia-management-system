import { applyAuthCors } from '../_lib/auth.js';
import { getMany, query } from '../db.js';

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
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method === 'POST') {
    try {
      let body = req.body && typeof req.body === 'object' ? req.body : await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
        req.on('error', reject);
      });

      const branchId = body.branch || 'main';
      const draftId = `QUICK-${branchId.toUpperCase()}-${new Date().toISOString().slice(0, 7)}`;

      await query(
        `INSERT INTO mis_sales_drafts (id, branch_id, status, line_count, total_amount, total_quantity, created_at, updated_at)
         VALUES ($1, $2, 'draft', 0, 0, 0, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
        [draftId, branchId]
      );

      const lineUid = `LINE-${Date.now()}`;
      const qty = Number(body.quantity || 1);
      const price = Number(body.price || 0);

      await query(
        `INSERT INTO mis_sales_lines
           (draft_id, line_uid, distributor_name, distributor_code, sku, product_name,
            quantity, unit_price, branch_id, sale_timestamp, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',NOW(),NOW())`,
        [draftId, lineUid, '', '', body.receipt_number || '', body.product || '',
         qty, price, branchId, body.date ? new Date(body.date).toISOString() : new Date().toISOString()]
      );

      await query(
        `UPDATE mis_sales_drafts
         SET line_count = line_count + 1,
             total_amount = total_amount + $1,
             total_quantity = total_quantity + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [qty * price, qty, draftId]
      );

      return res.status(201).json({ success: true, draftId, lineUid });
    } catch (error) {
      console.error('MIS encoded-sales POST error:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
    }
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


