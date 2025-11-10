import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
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

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeLine(row) {
  if (!row) return null;
  const data = typeof row.data === 'object' && row.data !== null ? row.data : {};
  const validation = typeof row.validation === 'object' && row.validation !== null ? row.validation : {};
  return {
    id: row.id,
    line_uid: row.line_uid || data.tempId || `LINE-${row.id}`,
    distributor_name: row.distributor_name || data.distributorName || '',
    distributor_code: row.distributor_code || data.distributorNb || '',
    sku: row.sku || data.sku || '',
    product_name: row.product_name || data.productName || '',
    quantity: safeNumber(row.quantity ?? data.quantity ?? 0),
    unit_price: safeNumber(row.unit_price ?? data.unitPrice ?? 0),
    branch_id: row.branch_id || data.branch || '',
    sale_timestamp: row.sale_timestamp || data.timestamp || new Date().toISOString(),
    status: row.status || data.status || 'draft',
    validation,
    data,
  };
}

function normalizeDraft(row, lines) {
  if (!row) return null;
  const payload = typeof row.payload === 'object' && row.payload !== null ? row.payload : {};
  return {
    id: row.id,
    branch_id: row.branch_id,
    status: row.status || 'draft',
    total_amount: safeNumber(row.total_amount ?? payload.totalAmount ?? 0),
    total_quantity: safeNumber(row.total_quantity ?? payload.totalQuantity ?? 0),
    line_count: row.line_count ?? payload.lineCount ?? (lines?.length ?? 0),
    updated_at: row.updated_at,
    lines: Array.isArray(lines) ? lines.map(normalizeLine).filter(Boolean) : [],
    payload,
  };
}

async function loadDraft(id) {
  const draft = await getOne('SELECT * FROM mis_sales_drafts WHERE id = $1', [id]);
  if (!draft) return null;
  const lines = await getMany(
    `
      SELECT *
      FROM mis_sales_lines
      WHERE draft_id = $1
      ORDER BY created_at DESC
    `,
    [id]
  );
  return normalizeDraft(draft, lines);
}

async function persistDraft(client, draft, user) {
  const draftId = draft.id || `DRAFT-${Date.now()}`;
  const branchId = draft.branch || draft.branch_id || 'main';
  const lines = Array.isArray(draft.lines) ? draft.lines : [];

  const totals = lines.reduce(
    (acc, line) => {
      const qty = safeNumber(line.quantity, 0);
      const price = safeNumber(line.unitPrice || line.unit_price, 0);
      acc.quantity += qty;
      acc.amount += qty * price;
      return acc;
    },
    { quantity: 0, amount: 0 }
  );

  await client.query(
    `
      INSERT INTO mis_sales_drafts (id, branch_id, status, line_count, total_amount, total_quantity, payload, metadata, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, $10), $11, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        status = EXCLUDED.status,
        line_count = EXCLUDED.line_count,
        total_amount = EXCLUDED.total_amount,
        total_quantity = EXCLUDED.total_quantity,
        payload = EXCLUDED.payload,
        metadata = EXCLUDED.metadata,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
    [
      draftId,
      branchId,
      draft.status || 'draft',
      lines.length,
      totals.amount,
      totals.quantity,
      JSON.stringify(draft),
      draft.metadata ? JSON.stringify(draft.metadata) : null,
      user?.fullName || user?.username || null,
      user?.username || null,
      user?.fullName || user?.username || null,
    ]
  );

  await client.query('DELETE FROM mis_sales_lines WHERE draft_id = $1', [draftId]);

  for (const line of lines) {
    const validation = line.validation || {};
    const distributorMatch = validation.distributor ?? null;
    const productMatch = validation.product ?? null;
    const notes = Array.isArray(validation.notes) ? validation.notes : [];

    await client.query(
      `
        INSERT INTO mis_sales_lines (
          draft_id,
          line_uid,
          distributor_name,
          distributor_code,
          sku,
          product_name,
          quantity,
          unit_price,
          branch_id,
          sale_timestamp,
          status,
          validation,
          data,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
        )
      `,
      [
        draftId,
        line.tempId || line.line_uid || `LINE-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        line.distributorName || line.distributor_name || '',
        line.distributorNb || line.distributor_code || '',
        line.sku || '',
        line.productName || line.product_name || '',
        safeNumber(line.quantity, 0),
        safeNumber(line.unitPrice || line.unit_price, 0),
        line.branch || line.branch_id || branchId,
        line.timestamp || line.sale_timestamp || new Date().toISOString(),
        line.status || 'draft',
        JSON.stringify({
          distributor: distributorMatch,
          product: productMatch,
          notes,
        }),
        JSON.stringify(line),
      ]
    );
  }

  return loadDraft(draftId);
}

async function verifyLines(client, draftId, lineIds, user) {
  if (!Array.isArray(lineIds) || lineIds.length === 0) return loadDraft(draftId);

  await client.query(
    `
      UPDATE mis_sales_lines
      SET status = 'verified',
          validation = COALESCE(validation, '{}'::jsonb) || jsonb_build_object('verifiedBy', $2, 'verifiedAt', NOW()),
          updated_at = NOW()
      WHERE draft_id = $1
        AND (line_uid = ANY($3::text[]) OR id = ANY($4::bigint[]))
    `,
    [
      draftId,
      user?.fullName || user?.username || null,
      lineIds,
      lineIds.filter((value) => /^\d+$/.test(String(value))).map((value) => Number(value)),
    ]
  );

  await client.query(
    `
      UPDATE mis_sales_drafts
      SET status = CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM mis_sales_lines WHERE draft_id = $1 AND status <> 'verified'
            )
            THEN 'verified'
            ELSE status
          END,
          updated_by = COALESCE($2, updated_by),
          updated_at = NOW()
      WHERE id = $1
    `,
    [draftId, user?.fullName || user?.username || null]
  );

  return loadDraft(draftId);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const saved = await withTransaction(async (client) => {
        return persistDraft(client, body.draft || body, body.user || {});
      });
      return res.status(200).json({ success: true, draft: saved });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      if (body.action !== 'verify') {
        return res.status(400).json({ success: false, error: 'Unsupported action' });
      }
      if (!body.draftId) {
        return res.status(400).json({ success: false, error: 'draftId is required' });
      }
      const saved = await withTransaction(async (client) => {
        return verifyLines(client, body.draftId, Array.isArray(body.lineIds) ? body.lineIds : [], body.user || {});
      });
      return res.status(200).json({ success: true, draft: saved });
    }

    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = searchParams.get('id');
      if (!id) {
        return res.status(400).json({ success: false, error: 'id parameter is required' });
      }
      const draft = await loadDraft(id);
      if (!draft) {
        return res.status(404).json({ success: false, error: 'Draft not found' });
      }
      return res.status(200).json({ success: true, draft });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('MIS drafts API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}


