import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const HOST = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOY_VERSION = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const VERSION_FILE = path.join(__dirname, 'version.json');
try {
  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: DEPLOY_VERSION, deployedAt: new Date().toISOString() }), 'utf8');
} catch (e) {
  console.warn('Could not write version.json:', e.message);
}

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

const PUBLIC_ROUTE_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/distributor-login',
  '/api/distributors',
  '/api/distributor-agreement',
  '/api/distributor-import',
  '/api/orders',
  '/api/delivery',
  '/api/appointments',
  '/api/collect',
  '/api/realtime_publish',
  '/api/send-email',
  '/api/reports',
  '/api/clients',
  '/api/employees',
  '/api/users',
  '/api/stock-batches',
  '/api/stock-requests',
  '/api/stock-movements',
  '/api/stock/',
  '/api/stock/transfers',
  '/api/stock/import',
  '/api/stock/dispatch',
  '/api/supplier-imports',
  '/api/field-stock',
  '/api/branch/',
  '/api/leave-requests',
  '/api/cash-requests',
  '/api/mis/',
  '/api/admin/',
  '/api/gm/',
  '/api/finance/',
  '/api/director/',
  '/api/system',
  '/api/sales',
  '/api/consultations',
  '/api/prescriptions',
  '/api/receipts',
  '/api/prices',
  '/api/upload',
  '/api/field_program_requests',
  '/api/campaigns',
  '/api/products',
  '/api/branches',
  '/api/product_images',
  '/api/notifications',
  '/api/media',
  '/api/branch-activity',
  '/api/branch-client-visits',
  '/api/reports/branch-sales',
  '/api/jobs/',
  '/api/hr/',
  '/api/version',
];

function isPublicRoute(routePath) {
  return PUBLIC_ROUTE_PREFIXES.some(prefix =>
    routePath === prefix ||
    routePath.startsWith(prefix.endsWith('/') ? prefix : prefix + '/') ||
    routePath.startsWith(prefix + '?')
  );
}

app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const routePath = req.baseUrl + req.path.replace(/\/$/, '');
  const isPublic = isPublicRoute(routePath);

  try {
    const { getTokenFromRequest, verifyAuthToken } = await import('./api/_lib/auth.js');
    const token = getTokenFromRequest(req);
    const decoded = verifyAuthToken(token);
    if (decoded && decoded.sub) {
      req.user = decoded;
    } else if (!isPublic) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
  } catch (err) {
    if (!isPublic) {
      console.error('Auth middleware error:', err);
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
  }
  next();
});

app.get('/dynapharm-complete-system', (req, res) => res.redirect('/dynapharm-complete-system.html'));
app.get('/distributor/guest', (req, res) => res.redirect('/distributor-guest.html'));
app.get('/staff/appointments', (req, res) => res.redirect('/appointments-admin.html'));

const handlerCache = new Map();

function normalizeApiPath(pathname = '') {
  if (typeof pathname !== 'string') {
    return null;
  }
  let normalized = pathname.replace(/^\/api/, '');
  if (normalized === '' || normalized === '/') {
    return null;
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (!/^[\/0-9A-Za-z_\-]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

async function tryLoadModule(normalized) {
  if (handlerCache.has(normalized)) {
    return handlerCache.get(normalized);
  }
  const modulePath = `./api${normalized}.js`;
  try {
    const module = await import(modulePath);
    if (typeof module?.default === 'function') {
      handlerCache.set(normalized, module.default);
      return module.default;
    }
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(error.message)) {
      handlerCache.set(normalized, null);
      return null;
    }
    console.error(`Failed to load API handler for ${normalized}:`, error);
    throw error;
  }
  handlerCache.set(normalized, null);
  return null;
}

async function getHandler(pathname) {
  const normalized = normalizeApiPath(pathname);
  if (!normalized) return null;

  // Try exact path first
  const exact = await tryLoadModule(normalized);
  if (exact) return exact;

  // Walk up parent segments to find a handler that can handle sub-paths
  // e.g. /campaigns/CAMP-123/participants → try /campaigns
  const segments = normalized.split('/').filter(Boolean);
  for (let len = segments.length - 1; len >= 1; len--) {
    const parentPath = '/' + segments.slice(0, len).join('/');
    if (!/^[\/0-9A-Za-z_\-]+$/.test(parentPath)) continue;
    const parent = await tryLoadModule(parentPath);
    if (parent) return parent;
  }

  return null;
}

app.options('/api/*', async (req, res) => {
  try {
    const { applyAuthCors } = await import('./api/_lib/auth.js');
    applyAuthCors(req, res);
  } catch (error) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  res.status(200).end();
});

app.get('/api/leave-requests', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const { rows } = await query(
      `SELECT id, employee_id AS staff, employee_name AS "staffName", leave_type AS type,
              start_date AS "startDate", end_date AS "endDate", reason,
              INITCAP(status) AS status,
              COALESCE(urgent, false) AS urgent,
              created_at AS "submittedAt"
       FROM hr_leave_requests
       WHERE LOWER(employee_id) = $1
       ORDER BY created_at DESC`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('leave-requests GET:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/leave-requests', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const staffName = req.user?.name || req.user?.full_name || username;
    const { type, startDate, endDate, reason, urgent } = req.body;
    if (!type || !startDate || !endDate || !reason) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    await query(
      `INSERT INTO hr_leave_requests (employee_id, employee_name, leave_type, start_date, end_date, reason, urgent, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW(), NOW())`,
      [username, staffName, type, startDate, endDate, reason, !!urgent, username]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('leave-requests POST:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: get all leave requests for review/approval
app.get('/api/leave-requests/admin', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director', 'mis'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { status } = req.query;
    let sql = `SELECT id, employee_id AS staff, employee_name AS "staffName",
                      leave_type AS type, start_date AS "startDate", end_date AS "endDate",
                      reason, INITCAP(status) AS status, COALESCE(urgent, false) AS urgent,
                      created_at AS "submittedAt", approved_by AS "approvedBy", notes
               FROM hr_leave_requests`;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`LOWER(status) = LOWER($${params.length})`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('leave-requests/admin GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin/GM/Finance: approve or reject a leave request
app.patch('/api/leave-requests/:id', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { id } = req.params;
    const { status, note } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    const existing = await getOne('SELECT * FROM hr_leave_requests WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    const actorName = req.user?.full_name || req.user?.username || role;
    await query(
      `UPDATE hr_leave_requests SET status = $1, approved_by = $2, notes = $3, approved_at = NOW(), updated_at = NOW() WHERE id = $4`,
      [status, actorName, note || null, id]
    );
    res.json({ success: true, status });
  } catch (err) {
    console.error('leave-requests PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cash-requests', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const { rows } = await query(
      `SELECT id, requested_by AS staff, data->>'staffName' AS "staffName",
              CAST(amount AS TEXT) AS amount, purpose,
              INITCAP(status) AS status,
              (data->>'urgent')::boolean AS urgent,
              created_at AS "submittedAt"
       FROM finance_cash_requests
       WHERE LOWER(requested_by) = $1
       ORDER BY created_at DESC`,
      [username]
    );
    res.json(rows);
  } catch (err) {
    console.error('cash-requests GET:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cash-requests', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const staffName = req.user?.name || req.user?.full_name || username;
    const { amount, purpose, urgent, neededBy } = req.body;
    if (!amount || !purpose) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const reqNum = 'CR-' + Date.now();
    await query(
      `INSERT INTO finance_cash_requests (id, request_number, branch, amount, purpose, status, requested_by, created_at, data)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), $7::jsonb)`,
      [
        'CR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        reqNum,
        req.user?.branch || 'unknown',
        parseFloat(amount),
        purpose,
        username,
        JSON.stringify({ staffName, urgent: !!urgent, neededBy: neededBy || null }),
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('cash-requests POST:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Finance/GM: get all cash requests for review/approval
app.get('/api/cash-requests/admin', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director', 'mis'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { status, branch } = req.query;
    let sql = `SELECT id, request_number, branch, amount, purpose, status,
                      requested_by, data->>'staffName' AS staff_name,
                      (data->>'urgent')::boolean AS urgent,
                      data->>'neededBy' AS needed_by,
                      data->>'financeNote' AS finance_note,
                      data->>'gmNote' AS gm_note,
                      data->>'reviewedBy' AS reviewed_by,
                      data->>'gmApprovedBy' AS gm_approved_by,
                      created_at, updated_at
               FROM finance_cash_requests`;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (branch) { params.push(branch); conds.push(`branch = $${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('cash-requests/admin GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Finance marks as reviewed; GM approves/rejects
app.patch('/api/cash-requests/:id', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { id } = req.params;
    const { status, note } = req.body;
    const actorName = req.user?.full_name || req.user?.username || role;
    const existing = await getOne('SELECT * FROM finance_cash_requests WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Request not found' });
    // Merge additional tracking into JSONB data
    const currentData = existing.data || {};
    const dataUpdates = { ...currentData };
    if (status === 'finance_reviewed') {
      dataUpdates.reviewedBy = actorName;
      dataUpdates.financeNote = note || null;
      dataUpdates.reviewedAt = new Date().toISOString();
    } else if (status === 'approved') {
      dataUpdates.gmApprovedBy = actorName;
      dataUpdates.gmNote = note || null;
      dataUpdates.approvedAt = new Date().toISOString();
    } else if (status === 'rejected') {
      dataUpdates.rejectedBy = actorName;
      dataUpdates.gmNote = note || null;
      dataUpdates.rejectedAt = new Date().toISOString();
    }
    await query(
      `UPDATE finance_cash_requests SET status = $1, data = $2::jsonb, updated_at = NOW() WHERE id = $3`,
      [status, JSON.stringify(dataUpdates), id]
    );
    res.json({ success: true, status });
  } catch (err) {
    console.error('cash-requests PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stock Adjustment Requests (requires GM approval) ──────────────────────────
app.get('/api/stock-adjustments', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { status, target_id } = req.query;
    let sql = 'SELECT * FROM stock_adjustments';
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (target_id) { params.push(target_id); conds.push(`target_id = $${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('stock-adjustments GET:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock-adjustments', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { target_type, target_id, product_name, location, field_to_adjust, old_value, new_value, reason } = req.body;
    if (!target_type || !field_to_adjust || !new_value || !reason) {
      return res.status(400).json({ error: 'target_type, field_to_adjust, new_value, reason are required' });
    }
    const id = 'ADJ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const adj_number = 'ADJ-' + String(Date.now()).slice(-6);
    const requested_by = req.user?.sub || req.user?.username || 'unknown';
    const requested_by_name = req.user?.name || requested_by;
    await query(
      `INSERT INTO stock_adjustments (id, adj_number, target_type, target_id, product_name, location, field_to_adjust, old_value, new_value, reason, requested_by, requested_by_name, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',NOW(),NOW())`,
      [id, adj_number, target_type, target_id || null, product_name || null, location || null, field_to_adjust, old_value || null, new_value, reason, requested_by, requested_by_name]
    );
    res.status(201).json({ success: true, id, adj_number });
  } catch (err) {
    console.error('stock-adjustments POST:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/stock-adjustments/:id/approve', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const adjId = req.params.id;
    const gm_notes = req.body?.gm_notes || '';
    const approved_by = req.user?.sub || req.user?.username || 'gm';
    const approved_by_name = req.user?.name || approved_by;

    const adj = await getOne('SELECT * FROM stock_adjustments WHERE id = $1', [adjId]);
    if (!adj) return res.status(404).json({ error: 'Adjustment not found' });
    if (adj.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    const { field_to_adjust, new_value, target_id, target_type } = adj;

    // stock_batches column name mapping (API exposes 'batch_number' but DB column is 'batch_no')
    const batchColumnMap = {
      batch_number: 'batch_no',
      quantity: 'quantity',
      expiry_date: 'expiry_date',
      unit_price: 'unit_price',
      notes: 'notes',
      remaining_quantity: 'remaining_quantity',
    };

    if (target_id && field_to_adjust) {
      if (['import', 'country_stock', 'warehouse'].includes(target_type)) {
        const dbCol = batchColumnMap[field_to_adjust];
        if (!dbCol) return res.status(400).json({ error: `Field '${field_to_adjust}' is not adjustable` });

        await query(`UPDATE stock_batches SET ${dbCol} = $1, updated_at = NOW() WHERE id = $2`, [new_value, target_id]);

        // Log to stock_movements (no ON CONFLICT — use unique movement id)
        const movId = 'MOV-ADJ-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
        const qtyDelta = field_to_adjust === 'quantity' ? Number(new_value) - Number(adj.old_value || 0) : 0;
        try {
          await query(
            `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,'adjustment',$4,$4,$5,$6,$7,NOW(),NOW())`,
            [movId, adj.product_name || 'Unknown', qtyDelta, adj.location || target_type, adjId,
             `Approved correction: ${field_to_adjust} changed from ${adj.old_value} to ${new_value}`, approved_by]
          );
        } catch (movErr) {
          console.warn('stock_movements insert skipped:', movErr.message);
        }

      } else if (target_type === 'distribution') {
        // stock_transfers has no quantity/expiry/batch columns — those are in stock_request_items
        if (field_to_adjust === 'quantity') {
          // Update quantity in stock_request_items linked to this transfer
          const transfer = await getOne('SELECT request_id FROM stock_transfers WHERE id = $1', [target_id]);
          if (transfer?.request_id) {
            await query(
              `UPDATE stock_request_items SET quantity = $1 WHERE request_id = $2 AND product_name = $3`,
              [Number(new_value), transfer.request_id, adj.product_name]
            );
          }
        } else if (field_to_adjust === 'notes') {
          await query(`UPDATE stock_transfers SET dispatch_notes = $1, updated_at = NOW() WHERE id = $2`, [new_value, target_id]);
        }
        // Log movement for distribution quantity changes
        if (field_to_adjust === 'quantity') {
          const movId = 'MOV-ADJ-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
          try {
            await query(
              `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
               VALUES ($1,$2,$3,'adjustment',$4,$4,$5,$6,$7,NOW(),NOW())`,
              [movId, adj.product_name || 'Unknown',
               Number(new_value) - Number(adj.old_value || 0),
               adj.location || 'distribution', adjId,
               `Approved distribution correction: quantity changed from ${adj.old_value} to ${new_value}`, approved_by]
            );
          } catch (movErr) {
            console.warn('stock_movements insert skipped:', movErr.message);
          }
        }
      }
    }

    await query(
      `UPDATE stock_adjustments SET status='approved', gm_notes=$1, approved_by=$2, approved_by_name=$3, approved_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [gm_notes, approved_by, approved_by_name, adjId]
    );
    res.json({ success: true, message: 'Adjustment approved and applied' });
  } catch (err) {
    console.error('stock-adjustments approve:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/stock-adjustments/:id/reject', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const adjId = req.params.id;
    const gm_notes = req.body?.gm_notes || '';
    const approved_by = req.user?.sub || req.user?.username || 'gm';
    const approved_by_name = req.user?.name || approved_by;
    await query(
      `UPDATE stock_adjustments SET status='rejected', gm_notes=$1, approved_by=$2, approved_by_name=$3, approved_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [gm_notes, approved_by, approved_by_name, adjId]
    );
    res.json({ success: true, message: 'Adjustment rejected' });
  } catch (err) {
    console.error('stock-adjustments reject:', err);
    res.status(500).json({ error: err.message });
  }
});
// ── End Stock Adjustment Routes ────────────────────────────────────────────────

// ── Stock Request Status Update (GM Approval) ──────────────────────────────────
app.put('/api/stock-requests/:id', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const id = req.params.id;
    const { status, notes } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });
    const actorName = req.user?.name || req.user?.sub || 'gm';
    await query(
      `UPDATE stock_requests SET status=$1, notes=COALESCE($2, notes), approved_by=$3, approved_at=NOW(), updated_at=NOW(), last_status_change=NOW() WHERE id=$4`,
      [status, notes || null, actorName, id]
    );
    const updated = await getOne('SELECT * FROM stock_requests WHERE id=$1', [id]);
    res.json({ success: true, request: updated });
  } catch (err) {
    console.error('stock-requests PUT/:id', err);
    res.status(500).json({ error: err.message });
  }
});
// ── End Stock Request Update Route ─────────────────────────────────────────────

// ── Product Price Routes ────────────────────────────────────────────────────────
const STATIC_PRICE_LIST = [
  {description:"ARABICA COFFEE MIX W/GOAT'S AND GANO 25gx20's",dp:260,cp:320,bv:43,cif:110},
  {description:"BEE POLLEN CAPSULE (30's)",dp:182,cp:237,bv:32,cif:78},
  {description:"BEE POLLEN CAPSULE (100's)",dp:320,cp:390,bv:75,cif:136},
  {description:"BODY CONTOUR CREAM",dp:290,cp:377,bv:75,cif:123},
  {description:"COMPACT POWDER 12g",dp:190,cp:247,bv:55,cif:81},
  {description:"D.I GROW (GREEN) (1 LITER)",dp:300,cp:400,bv:38,cif:128},
  {description:"D.I GROW (GREEN) (4LITERS)",dp:800,cp:1000,bv:115,cif:340},
  {description:"D.I GROW (RED) (1 LITER)",dp:300,cp:400,bv:38,cif:128},
  {description:"D.I GROW (RED) (4LITERS)",dp:650,cp:800,bv:115,cif:276},
  {description:"D.I GROW BIO-8 1 LTR",dp:220,cp:286,bv:27,cif:94},
  {description:"D.I GROW K 1 LTR",dp:220,cp:286,bv:30,cif:94},
  {description:"D.I. INSTANT GOAT'S MILK POWDER PREMIX 20's x 21g",dp:325,cp:400,bv:43,cif:138},
  {description:"D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'",dp:221,cp:287,bv:38,cif:94},
  {description:"DI LIQUID ALFALFA PLUS GUARANA (500ml)",dp:430,cp:530,bv:75,cif:183},
  {description:"DI LIQUID ALFALFAPLUS GUARANA (150ml)",dp:200,cp:260,bv:21,cif:85},
  {description:"DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml",dp:430,cp:530,bv:75,cif:183},
  {description:"DI NONI 500ml",dp:350,cp:455,bv:110,cif:149},
  {description:"DI NONI JUICE 1 L",dp:750,cp:950,bv:175,cif:319},
  {description:"DYNA C- 100 TABLET 150's",dp:140,cp:182,bv:32,cif:60},
  {description:"DYNA C- 250 TABLET 90's",dp:140,cp:182,bv:27,cif:60},
  {description:"DYNA 'S' TABLET 120's",dp:290,cp:360,bv:65,cif:123},
  {description:"DYNA SERENOA TABLET 100's",dp:520,cp:620,bv:115,cif:221},
  {description:"DYNA SERENOA TABLET 30's",dp:195,cp:254,bv:38,cif:83},
  {description:"DYNA TONIC (150ml)",dp:208,cp:270,bv:27,cif:88},
  {description:"DYNA TONIC (780ml)",dp:600,cp:710,bv:120,cif:255},
  {description:"DYNA TOOTHBRUSH (SET 3 OF 3)",dp:70,cp:91,bv:15,cif:30},
  {description:"DYNA-RH CAPSULE 100's",dp:300,cp:390,bv:60,cif:128},
  {description:"E-VITA CREAM (50g)",dp:610,cp:700,bv:165,cif:259},
  {description:"GANODERMA LOTION 150ML",dp:182,cp:237,bv:38,cif:77},
  {description:"GANODERMA SHOWER GEL 150ml(GANODERMA BODY SCRUB)",dp:220,cp:285,bv:38,cif:94},
  {description:"GANODERMA SOAP 2 x 100g",dp:140,cp:182,bv:30,cif:60},
  {description:"GANODERMA TOOTHPASTE (150g)",dp:150,cp:194,bv:20,cif:64},
  {description:"GINALI CAPSULE 100's",dp:403,cp:493,bv:80,cif:171},
  {description:"GINALI CAPSULE 30's",dp:195,cp:254,bv:38,cif:83},
  {description:"GINSENG CAPSULE 9 x 10's",dp:546,cp:655,bv:115,cif:232},
  {description:"GOAT'S MILK SOAP (100g)",dp:70,cp:91,bv:15,cif:30},
  {description:"GOAT'S MILK TABLET 150's",dp:286,cp:372,bv:48,cif:122},
  {description:"GOAT'S MILK TABLET 75's",dp:170,cp:221,bv:27,cif:72},
  {description:"GREEN TEA CAPSULE 30's",dp:195,cp:254,bv:43,cif:83},
  {description:"GREEN TEA CAPSULE 60's",dp:344,cp:430,bv:85,cif:146},
  {description:"HERBA WARISAN MAHARANI 6 x 10g",dp:520,cp:620,bv:110,cif:221},
  {description:"HIGH FIBER NUTRITION FOOD 30'sx25g",dp:660,cp:790,bv:120,cif:281},
  {description:"INSTANT CAPPUCCINO W/ GANO 15's x 35g",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT CEREAL 15's x 32g",dp:325,cp:423,bv:48,cif:138},
  {description:"INSTANT CEREAL 30's x 32g",dp:510,cp:610,bv:95,cif:217},
  {description:"INSTANT CHOC W/ GANO 30's x 30g",dp:325,cp:423,bv:43,cif:138},
  {description:"INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)",dp:250,cp:300,bv:38,cif:107},
  {description:"INSTANT COFFEE MIX WITH GANODERMA 4-IN-1(SACHET) (20's x 21g)",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT COFFEE W/ TONGKAT ALI 20's x 21g",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT COFFEE W/GANO & TONGKAT ALI BLACK 30's x 5g",dp:276,cp:359,bv:59,cif:117},
  {description:"INSTANT GINSENG HONEY GINGER 500g",dp:350,cp:420,bv:43,cif:149},
  {description:"INSTANT PEGAGA CAFE 25G x 15s",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT PREMIX COFFEE WITH MANGOSTEEN(25'sx15g)",dp:260,cp:320,bv:38,cif:110},
  {description:"INSTANT WHEATGRASS W/ CHLOROPHYLL 20's x 10g",dp:286,cp:372,bv:43,cif:122},
  {description:"MILK TEA WITH TONGKAT ALI 21g x 20's",dp:230,cp:290,bv:43,cif:98},
  {description:"MILK THISTLE TABLET 120's",dp:500,cp:592,bv:125,cif:213},
  {description:"MILK THISTLE TABLET 30's",dp:195,cp:254,bv:32,cif:83},
  {description:"MINERAL POT",dp:1250,cp:1625,bv:265,cif:531},
  {description:"Nano Home Feminine Wash Antiseptic w/ Sirih 60ml",dp:100,cp:130,bv:11.5,cif:43},
  {description:"Nano Home Feminine Wash Kacip Fatimah 60ml",dp:100,cp:130,bv:11.5,cif:43},
  {description:"NANO HOME FEMININE WASH with GAMAT 60ml",dp:100,cp:130,bv:11.5,cif:43},
  {description:"NANO HOME GAMAT SOAP 100g",dp:70,cp:91,bv:15,cif:30},
  {description:"NANO HOME PEGAGA SOAP 100g",dp:70,cp:91,bv:8,cif:30},
  {description:"NONI PLUS TEA 30's x 3g",dp:299,cp:360,bv:65,cif:127},
  {description:"NUTMEG OINTMENT (2's x 20g)",dp:180,cp:234,bv:19.5,cif:77},
  {description:"PRESIDENT'S CHOICE 4 IN 1 AND CHOCOLATE COFFEE 20'",dp:288,cp:374,bv:43,cif:122},
  {description:"PRO- LSB TABLET 150's",dp:455,cp:573,bv:100,cif:193},
  {description:"PROLINK 20's x 20g",dp:588,cp:688,bv:135,cif:250},
  {description:"PROLINK 30's x 20g",dp:600,cp:719,bv:170,cif:255},
  {description:"RED COFFEE W/ GINSENG (12's x 25g)",dp:260,cp:320,bv:38,cif:110},
  {description:"REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)",dp:1200,cp:1200,bv:150,cif:510},
  {description:"REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)",dp:1200,cp:1200,bv:150,cif:510},
  {description:"SEA CUCUMBER JELLY (250ml)",dp:312,cp:406,bv:55,cif:133},
  {description:"SEA CUCUMBER JELLY (500ml)",dp:533,cp:633,bv:110,cif:227},
  {description:"SEA WATER SPIRULINA POWDER 500g",dp:340,cp:420,bv:48,cif:145},
  {description:"SOYBEAN POWDER 454g",dp:260,cp:338,bv:38,cif:110},
  {description:"SPIRULINA TABLET (1,000's)",dp:750,cp:900,bv:150,cif:319},
  {description:"SPIRULINA TABLET (100's)",dp:208,cp:270,bv:27,cif:88},
  {description:"SPIRULINA TABLET (300's)",dp:351,cp:456,bv:64,cif:149},
  {description:"TEA TREE OIL FEMININE WASH (250ml)",dp:190,cp:247,bv:43,cif:81},
  {description:"TEA TREE OIL LOTION (250ml)",dp:180,cp:234,bv:19.5,cif:77},
  {description:"TEA TREE OIL TOOTHPASTE (175g)",dp:150,cp:194,bv:20,cif:64},
  {description:"TONGKAT ALI CAPSULE 100's",dp:400,cp:490,bv:80,cif:170},
  {description:"TONGKAT ALI CAPSULE 30's",dp:195,cp:254,bv:32,cif:83},
  {description:"YEEGANO CAPSULE 30's",dp:195,cp:254,bv:27,cif:83},
  {description:"YEEGANO CAPSULE 90's",dp:364,cp:454,bv:75,cif:155},
  {description:"YEEGARLIC CAPSULE 90's",dp:300,cp:390,bv:64,cif:128},
  {description:"YEEGINKGO TABLET (30's)",dp:234,cp:304,bv:27,cif:99},
  {description:"YEEGINKGO TABLETS 90's",dp:420,cp:500,bv:80,cif:179},
  {description:"YEEYANGYEN TABLET 30's",dp:195,cp:254,bv:32,cif:83},
  {description:"YEEYANGYEN TABLET 90's",dp:370,cp:455,bv:90,cif:157},
  {description:"INSTANT COFFEE MIX 20's x 30g",dp:260,cp:320,bv:38,cif:110},
];

const STATIC_PACKAGE_LIST = [
  { description: 'Gastric Package', dp: 2054, cp: 2432, cif: 0, bv: 381 },
  { description: 'Womens Package', dp: 2543, cp: 2950, cif: 0, bv: 481 },
  { description: 'Mens Health Package', dp: 2033, cp: 2362, cif: 0, bv: 388 },
  { description: 'Blood Circulation Pack', dp: 3290, cp: 3854, cif: 0, bv: 657 },
  { description: 'Cleansing And Detoxification Package', dp: 2183, cp: 2596, cif: 0, bv: 447 },
  { description: 'Weight Management Pack', dp: 2283, cp: 2680, cif: 0, bv: 448 },
  { description: 'Healthy Joints Package', dp: 3538, cp: 4177, cif: 0, bv: 687.5 },
];

async function initProductPricesTable() {
  try {
    const { query } = await import('./api/db.js');
    await query(`
      CREATE TABLE IF NOT EXISTS product_prices (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL UNIQUE,
        dp NUMERIC(10,2) NOT NULL DEFAULT 0,
        cp NUMERIC(10,2) NOT NULL DEFAULT 0,
        cif NUMERIC(10,2) NOT NULL DEFAULT 0,
        bv NUMERIC(10,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by TEXT DEFAULT 'system'
      )
    `);
    await query(`ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS is_package BOOLEAN DEFAULT FALSE`);
    let inserted = 0, updated = 0;
    for (const p of STATIC_PRICE_LIST) {
      const res = await query(
        `INSERT INTO product_prices (description, dp, cp, cif, bv) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (description) DO UPDATE
           SET dp=EXCLUDED.dp, cp=EXCLUDED.cp, cif=EXCLUDED.cif, bv=EXCLUDED.bv
           WHERE product_prices.updated_by = 'system'`,
        [p.description, p.dp, p.cp, p.cif, p.bv]
      );
      if (res.rowCount > 0) { if (res.command === 'INSERT') inserted++; else updated++; }
    }
    if (inserted > 0) console.log(`Seeded ${inserted} new products into product_prices`);
    if (updated > 0) console.log(`Corrected prices for ${updated} system-seeded products`);
    for (const pkg of STATIC_PACKAGE_LIST) {
      await query(
        `INSERT INTO product_prices (description, dp, cp, cif, bv, is_package) VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (description) DO UPDATE SET dp=$2, cp=$3, bv=$5, is_package=TRUE`,
        [pkg.description, pkg.dp, pkg.cp, pkg.cif, pkg.bv]
      );
    }
    console.log(`Ensured ${STATIC_PACKAGE_LIST.length} packages in product_prices`);
  } catch (err) {
    console.error('initProductPricesTable error:', err.message);
  }
}
initProductPricesTable();

app.get('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { rows } = await query('SELECT * FROM product_prices ORDER BY description');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected array of price updates' });
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    let count = 0;
    for (const u of updates) {
      if (!u.id) continue;
      await query(
        `UPDATE product_prices SET dp=$1, cp=$2, cif=$3, bv=$4, updated_at=NOW(), updated_by=$5 WHERE id=$6`,
        [Number(u.dp)||0, Number(u.cp)||0, Number(u.cif)||0, Number(u.bv)||0, updatedBy, u.id]
      );
      count++;
    }
    res.json({ success: true, updated: count });
  } catch (err) {
    console.error('PUT /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/prices/:id', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { id } = req.params;
    const { dp, cp, cif, bv, description } = req.body;
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    const fields = [];
    const vals = [];
    let i = 1;
    if (dp !== undefined) { fields.push(`dp=$${i++}`); vals.push(Number(dp)||0); }
    if (cp !== undefined) { fields.push(`cp=$${i++}`); vals.push(Number(cp)||0); }
    if (cif !== undefined) { fields.push(`cif=$${i++}`); vals.push(Number(cif)||0); }
    if (bv !== undefined) { fields.push(`bv=$${i++}`); vals.push(Number(bv)||0); }
    if (description !== undefined) { fields.push(`description=$${i++}`); vals.push(String(description)); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=NOW()`, `updated_by=$${i++}`);
    vals.push(updatedBy, id);
    await query(`UPDATE product_prices SET ${fields.join(',')} WHERE id=$${i}`, vals);
    const { rows } = await query('SELECT * FROM product_prices WHERE id=$1', [id]);
    res.json(rows[0] || { success: true });
  } catch (err) {
    console.error('PATCH /api/prices/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { description, dp, cp, cif, bv } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    const { rows } = await query(
      `INSERT INTO product_prices (description, dp, cp, cif, bv, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (description) DO UPDATE SET dp=$2,cp=$3,cif=$4,bv=$5,updated_by=$6,updated_at=NOW() RETURNING *`,
      [description, Number(dp)||0, Number(cp)||0, Number(cif)||0, Number(bv)||0, updatedBy]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/prices/:id', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    await query('DELETE FROM product_prices WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── End Product Price Routes ────────────────────────────────────────────────────

// ─── Centralized Stock Engine Read Endpoints ─────────────────────────────────

app.get('/api/stock/branch/:branchId/card', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const branchId = req.params.branchId;
    const startDate = req.query.from || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const endDate = req.query.to || new Date().toISOString().slice(0, 10);

    const [balances, movements] = await Promise.all([
      getMany(
        `SELECT * FROM inventory_balances WHERE location_type = 'branch' AND location_id = $1`,
        [branchId]
      ),
      getMany(
        `SELECT movement_type, quantity, source_location, destination_location, product_name
         FROM stock_movements
         WHERE status = 'posted'
           AND created_at >= $1::date AND created_at <= ($2 || 'T23:59:59')::timestamp
           AND (source_location = $3 OR destination_location = $3)`,
        [startDate, endDate, branchId]
      ),
    ]);

    const productCount = new Set(balances.filter(b => Number(b.closing_qty) > 0).map(b => b.product_name)).size;
    const closingStock = balances.reduce((s, b) => s + Number(b.closing_qty || 0), 0);
    const stockValueDP = balances.reduce((s, b) => s + Number(b.stock_value_dp || 0), 0);
    const salesUnits = movements
      .filter(m => ['walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'sale'].includes(m.movement_type) && m.source_location === branchId)
      .reduce((s, m) => s + Number(m.quantity || 0), 0);
    const dispensedUnits = movements
      .filter(m => m.movement_type === 'prescription_dispense' && m.source_location === branchId)
      .reduce((s, m) => s + Number(m.quantity || 0), 0);

    res.json({ success: true, branchId, productCount, closingStock, stockValueDP, salesUnits, dispensedUnits });
  } catch (err) {
    console.error('[stock/branch/card]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/branch/:branchId/inventory', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const branchId = req.params.branchId;
    const rows = await getMany(
      `SELECT *, GREATEST(closing_qty, 0) as available_qty
       FROM inventory_balances
       WHERE location_type = 'branch' AND location_id = $1
       ORDER BY product_name ASC, expiry_date ASC NULLS LAST`,
      [branchId]
    );
    const fmt = (d) => d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null;
    const inventory = rows.map(r => ({
      id: r.id,
      locationId: r.location_id,
      productName: r.product_name,
      batchNo: r.batch_no,
      expiryDate: fmt(r.expiry_date),
      openingQty: Number(r.opening_qty || 0),
      inwardQty: Number(r.inward_qty || 0),
      outwardQty: Number(r.outward_qty || 0),
      closingQty: Number(r.closing_qty || 0),
      availableQty: Number(r.available_qty || 0),
      unitDP: r.unit_dp ? Number(r.unit_dp) : null,
      stockValueDP: Number(r.stock_value_dp || 0),
      lastMovementDate: r.last_movement_date,
    }));
    res.json({ success: true, branchId, inventory });
  } catch (err) {
    console.error('[stock/branch/inventory]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/branch/:branchId/movements', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const branchId = req.params.branchId;
    const limit = Math.min(parseInt(req.query.limit || '200'), 1000);
    const from = req.query.from || null;
    const to = req.query.to || null;

    const params = [branchId, branchId, limit];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}::date`; }
    if (to) { params.push(to + 'T23:59:59'); dateFilter += ` AND created_at <= $${params.length}::timestamp`; }

    const rows = await getMany(
      `SELECT id, product_name, batch_no, expiry_date, quantity, movement_type,
              source_location, source_location_type, destination_location, destination_location_type,
              reference_id, notes, created_by, status, movement_date, created_at
       FROM stock_movements
       WHERE status = 'posted'
         AND (source_location = $1 OR destination_location = $2)
         ${dateFilter}
       ORDER BY created_at DESC
       LIMIT $3`,
      params
    );

    const fmt = (d) => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
    const movements = rows.map(r => ({
      id: r.id,
      productName: r.product_name,
      batchNo: r.batch_no,
      expiryDate: fmt(r.expiry_date),
      quantity: Number(r.quantity || 0),
      movementType: r.movement_type,
      sourceLocation: r.source_location,
      sourceLocationType: r.source_location_type,
      destinationLocation: r.destination_location,
      destinationLocationType: r.destination_location_type,
      referenceId: r.reference_id,
      notes: r.notes,
      createdBy: r.created_by,
      createdAt: fmt(r.created_at),
    }));
    res.json({ success: true, branchId, movements });
  } catch (err) {
    console.error('[stock/branch/movements]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/warehouse/:warehouseId/inventory', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const warehouseId = req.params.warehouseId;
    const rows = await getMany(
      `SELECT * FROM inventory_balances
       WHERE location_type = 'warehouse' AND location_id = $1
       ORDER BY product_name ASC, expiry_date ASC NULLS LAST`,
      [warehouseId]
    );
    const inventory = rows.map(r => ({
      id: r.id,
      productName: r.product_name,
      batchNo: r.batch_no,
      expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
      closingQty: Number(r.closing_qty || 0),
      inwardQty: Number(r.inward_qty || 0),
      outwardQty: Number(r.outward_qty || 0),
      unitDP: r.unit_dp ? Number(r.unit_dp) : null,
      stockValueDP: Number(r.stock_value_dp || 0),
    }));
    res.json({ success: true, warehouseId, inventory });
  } catch (err) {
    console.error('[stock/warehouse/inventory]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/country/summary', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const rows = await getMany(
      `SELECT product_name,
              SUM(inward_qty) as total_in,
              SUM(outward_qty) as total_out,
              SUM(closing_qty) as closing_qty,
              SUM(stock_value_dp) as stock_value_dp
       FROM inventory_balances
       WHERE location_type = 'country'
       GROUP BY product_name
       ORDER BY product_name ASC`
    );
    const summary = rows.map(r => ({
      productName: r.product_name,
      totalIn: Number(r.total_in || 0),
      totalOut: Number(r.total_out || 0),
      closingQty: Number(r.closing_qty || 0),
      stockValueDP: Number(r.stock_value_dp || 0),
    }));
    res.json({ success: true, summary });
  } catch (err) {
    console.error('[stock/country/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/stock/admin/seed-balances', async (req, res) => {
  try {
    const { seedInventoryBalances } = await import('./api/services/stockEngine.js');
    const result = await seedInventoryBalances();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[stock/admin/seed-balances]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Parameterized routes registered before catch-all

// GET /api/distributors/by-nb/:nb
app.get('/api/distributors/by-nb/:nb', async (req, res) => {
  try {
    const { getOne } = await import('./api/db.js');
    const nb = req.params.nb;
    const dist = await getOne(
      `SELECT id as distributor_id, distributor_name as full_name, distributor_code as nb_number,
              branch as branch_id, COALESCE(status,'active') as status, mobile_no, email
       FROM distributors WHERE distributor_code = $1`,
      [nb]
    );
    if (!dist) return res.status(404).json({ success: false, error: `No distributor found with NB number: ${nb}` });
    return res.json({ success: true, ...dist });
  } catch (err) {
    console.error('[distributors/by-nb]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/consultations/:id/full
app.get('/api/consultations/:id/full', async (req, res) => {
  try {
    const { getOne, getMany } = await import('./api/db.js');
    const id = req.params.id;
    const report = await getOne(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!report) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof report.data === 'string' ? JSON.parse(report.data || '{}') : (report.data || {});
    const dispenses = await getMany(
      `SELECT product_name, batch_no, quantity, created_at FROM branch_inventory_movements
       WHERE reference = $1 AND type = 'prescription_dispense' ORDER BY created_at`,
      [id]
    );
    const dispensedByProduct = {};
    for (const d of dispenses) {
      dispensedByProduct[d.product_name] = (dispensedByProduct[d.product_name] || 0) + Number(d.quantity);
    }
    const prescription = (data.prescription || []).map(item => {
      const dispensed = dispensedByProduct[item.productName || item.product_name] || 0;
      const prescribed = Number(item.prescribedQty || item.quantity || 0);
      return {
        productId: item.productId || null,
        productName: item.productName || item.product_name,
        prescribedQty: prescribed,
        dispensedQtyTotal: dispensed,
        remainingQty: Math.max(0, prescribed - dispensed),
        status: dispensed === 0 ? 'pending' : dispensed >= prescribed ? 'fully_dispensed' : 'partially_dispensed',
      };
    });
    return res.json({
      success: true,
      consultationId: report.id,
      client: {
        fullName: data.clientName || data.full_name || data.client?.fullName || '',
        phone: data.phone || data.client?.phone || '',
        clientType: data.clientType || data.client_type || 'non_member',
        referralDistributorName: data.referralDistributorName || data.referral?.name || null,
        referralNb: data.referralNb || data.referral?.nb || null,
      },
      assessment: { symptoms: data.symptoms || '', notes: data.notes || '' },
      prescription,
      reportType: report.report_type,
      branch: report.branch,
      consultant: report.consultant,
      createdAt: report.created_at,
      clientWantsReport: data.clientWantsReport !== undefined ? data.clientWantsReport : true,
    });
  } catch (err) {
    console.error('[consultations/:id/full]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/consultations/:id/preview
app.get('/api/consultations/:id/preview', async (req, res) => {
  try {
    const { getOne } = await import('./api/db.js');
    const id = req.params.id;
    const report = await getOne(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!report) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof report.data === 'string' ? JSON.parse(report.data || '{}') : (report.data || {});
    return res.json({
      success: true,
      consultation: { ...data, id: report.id, branch: report.branch, consultant: report.consultant, createdAt: report.created_at },
      prescription: data.prescription || [],
      reportEligible: data.clientWantsReport !== false,
    });
  } catch (err) {
    console.error('[consultations/:id/preview]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/consultations/:id/report-preference
app.patch('/api/consultations/:id/report-preference', async (req, res) => {
  try {
    const { getOne, query } = await import('./api/db.js');
    const id = req.params.id;
    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const { clientWantsReport } = body;
    if (typeof clientWantsReport !== 'boolean') {
      return res.status(400).json({ success: false, error: 'clientWantsReport (boolean) is required' });
    }
    const existing = await getOne(`SELECT data FROM reports WHERE id = $1`, [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof existing.data === 'string' ? JSON.parse(existing.data || '{}') : (existing.data || {});
    data.clientWantsReport = clientWantsReport;
    await query(`UPDATE reports SET data = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(data), id]);
    return res.json({ success: true, consultationId: id, clientWantsReport });
  } catch (err) {
    console.error('[consultations/:id/report-preference]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/prescriptions/:id/dispense  (partial/full dispensing with batch+expiry)
app.post('/api/prescriptions/:id/dispense', async (req, res) => {
  try {
    const { query: dbQuery, getMany } = await import('./api/db.js');
    const { recomputeLocationBalances } = await import('./api/services/stockEngine.js');
    const prescriptionId = req.params.id;
    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const { branchId, dispensedBy, items, saveMode } = body;

    if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items required' });

    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.batchNo) errors.push(`Item ${i + 1}: batchNo required`);
      if (!it.expiryDate) errors.push(`Item ${i + 1}: expiryDate required`);
      if (!it.dispenseQty || Number(it.dispenseQty) <= 0) errors.push(`Item ${i + 1}: dispenseQty must be > 0`);
    }
    if (errors.length > 0) return res.status(422).json({ success: false, error: 'Validation failed', errors });

    const ts = Date.now();
    const dispenseRef = `DISP-${ts}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const posted = [];

    for (const item of items) {
      const productName = item.productName || item.product_name || '';
      if (!productName) continue;
      const qty = Number(item.dispenseQty);
      const unitDP = Number(item.unitDP || 0);

      // Update branch_inventory_batches if exists
      await dbQuery(
        `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW()
         WHERE branch_id = $2 AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
           AND (batch_no = $4 OR batch_no IS NULL) AND quantity >= $1`,
        [qty, branchId, productName, item.batchNo]
      ).catch(() => {});

      // Insert movement record
      const movId = `BIM-${ts}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      await dbQuery(
        `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
         VALUES ($1,$2,'prescription_dispense',$3,$4,$5,$6,$7,$8,NOW())`,
        [movId, branchId, productName, item.batchNo, qty, prescriptionId, `Partial dispense ref ${prescriptionId}`, dispensedBy || 'system']
      );

      // Post to stock_movements
      const smId = `MOV-${ts}-${Math.random().toString(36).slice(2, 6)}`;
      await dbQuery(
        `INSERT INTO stock_movements (id, product_name, batch_no, expiry_date, quantity, movement_type, source_location, source_location_type, destination_location, reference_id, notes, status, unit_dp, movement_date, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'prescription_dispense',$6,'branch','patient',$7,$8,'posted',$9,NOW(),NOW(),NOW())`,
        [smId, productName, item.batchNo, item.expiryDate, qty, branchId, prescriptionId, `Prescription dispense ${prescriptionId}`, unitDP]
      );

      posted.push({ productName, batchNo: item.batchNo, dispenseQty: qty, dispenseRef });
    }

    recomputeLocationBalances('branch', branchId).catch(() => {});

    return res.status(201).json({
      success: true,
      prescriptionId,
      saveMode: saveMode || 'partial',
      dispenseRef,
      itemsDispensed: posted.length,
      items: posted,
      message: `${saveMode === 'full' ? 'Full' : 'Partial'} dispense recorded for prescription ${prescriptionId}`,
    });
  } catch (err) {
    console.error('[prescriptions/:id/dispense]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/prescriptions/:id/dispensing-history
app.get('/api/prescriptions/:id/dispensing-history', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const prescriptionId = req.params.id;
    const rows = await getMany(
      `SELECT bim.product_name, bim.batch_no, bim.quantity as dispensed_qty,
              bim.created_by as dispensed_by, bim.created_at as dispense_date,
              bim.id as receipt_id
       FROM branch_inventory_movements bim
       WHERE bim.reference = $1 AND bim.type = 'prescription_dispense'
       ORDER BY bim.created_at ASC`,
      [prescriptionId]
    );
    const history = rows.map(r => ({
      dispenseDate: r.dispense_date,
      productName: r.product_name,
      batchNo: r.batch_no,
      dispensedQty: Number(r.dispensed_qty),
      dispensedBy: r.dispensed_by,
      receiptId: r.receipt_id,
    }));
    return res.json({ success: true, prescriptionId, history, totalRecords: history.length });
  } catch (err) {
    console.error('[prescriptions/:id/dispensing-history]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/prescriptions/:id/status
app.get('/api/prescriptions/:id/status', async (req, res) => {
  try {
    const { getOne, getMany } = await import('./api/db.js');
    const prescriptionId = req.params.id;
    const report = await getOne(`SELECT data FROM reports WHERE id = $1`, [prescriptionId]);
    const data = report ? (typeof report.data === 'string' ? JSON.parse(report.data || '{}') : (report.data || {})) : {};
    const prescription = data.prescription || [];
    const dispenses = await getMany(
      `SELECT product_name, SUM(quantity) as total_dispensed
       FROM branch_inventory_movements
       WHERE reference = $1 AND type = 'prescription_dispense'
       GROUP BY product_name`,
      [prescriptionId]
    );
    const dispensedMap = new Map(dispenses.map(d => [d.product_name, Number(d.total_dispensed)]));
    const items = prescription.map(item => {
      const name = item.productName || item.product_name || '';
      const prescribed = Number(item.prescribedQty || item.quantity || 0);
      const dispensed = dispensedMap.get(name) || 0;
      const remaining = Math.max(0, prescribed - dispensed);
      return {
        productName: name,
        prescribedQty: prescribed,
        dispensedQtyTotal: dispensed,
        remainingQty: remaining,
        status: dispensed === 0 ? 'pending' : remaining === 0 ? 'fully_dispensed' : 'partially_dispensed',
      };
    });
    const overallStatus = items.length === 0 ? 'no_prescription'
      : items.every(i => i.status === 'fully_dispensed') ? 'fully_dispensed'
      : items.some(i => i.dispensedQtyTotal > 0) ? 'partially_dispensed'
      : 'pending';
    return res.json({ success: true, prescriptionId, status: overallStatus, items });
  } catch (err) {
    console.error('[prescriptions/:id/status]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sales/:saleId
app.get('/api/sales/:saleId', async (req, res) => {
  try {
    const { getOne } = await import('./api/db.js');
    const saleId = req.params.saleId;
    const sale = await getOne(`SELECT * FROM branch_walkin_sales WHERE id = $1`, [saleId]);
    if (!sale) return res.status(404).json({ success: false, error: `Sale ${saleId} not found` });
    const items = typeof sale.items === 'string' ? JSON.parse(sale.items || '[]') : (sale.items || []);
    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata || '{}') : (sale.metadata || {});
    return res.json({
      success: true,
      saleId: sale.id,
      saleNumber: sale.sale_number,
      branchId: sale.branch_id,
      saleDate: sale.sale_date,
      customerName: sale.customer_name,
      customerType: sale.customer_type,
      paymentMethod: sale.payment_method,
      subtotal: Number(sale.subtotal),
      total: Number(sale.total),
      status: sale.status,
      items,
      referralDistributorName: meta.referralName || null,
      referralNb: meta.referralNb || null,
      createdBy: sale.created_by,
      createdAt: sale.created_at,
    });
  } catch (err) {
    console.error('[sales/:saleId]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/receipts/:receiptId/render?copyType=branch|distributor
app.get('/api/receipts/:receiptId/render', async (req, res) => {
  try {
    const { getOne } = await import('./api/db.js');
    const receiptId = req.params.receiptId;
    const copyType = req.query.copyType || 'branch';
    const copyLabel = copyType === 'distributor' ? 'Distributor Copy' : 'Branch Copy';

    const sale = await getOne(`SELECT * FROM branch_walkin_sales WHERE id = $1`, [receiptId]);
    if (!sale) return res.status(404).json({ success: false, error: `Receipt ${receiptId} not found` });

    const rawItems = typeof sale.items === 'string' ? JSON.parse(sale.items || '[]') : (sale.items || []);
    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata || '{}') : (sale.metadata || {});

    const { getOne: branchRow } = await import('./api/db.js');
    const branch = await branchRow(`SELECT name FROM branches WHERE id = $1`, [sale.branch_id]);

    const items = rawItems.map(i => ({
      productName: i.productName || i.name || i.product_name || '',
      quantity: Number(i.quantity || i.qty || 0),
      unitPrice: Number(i.unitPrice || i.unit_price || i.price || 0),
      lineTotal: Number(i.lineTotal || i.line_total || (i.quantity * (i.unitPrice || i.unit_price || 0)) || 0),
      batchNo: i.batchNo || i.batch_no || null,
      expiryDate: i.expiryDate || i.expiry_date || null,
    }));

    return res.json({
      success: true,
      receiptId,
      copyLabel,
      copyType,
      branchName: branch?.name || sale.branch_id,
      saleNumber: sale.sale_number,
      saleDate: sale.sale_date,
      customerName: sale.customer_name,
      customerType: sale.customer_type,
      paymentMethod: sale.payment_method,
      items,
      subtotal: Number(sale.subtotal),
      total: Number(sale.total),
      referralDistributorName: meta.referralName || null,
      referralNb: meta.referralNb || null,
      createdBy: sale.created_by,
    });
  } catch (err) {
    console.error('[receipts/:receiptId/render]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.all('/api/*', async (req, res) => {
  try {
    const handler = await getHandler(req.path);
    if (!handler) {
      try {
        const { applyAuthCors } = await import('./api/_lib/auth.js');
        applyAuthCors(req, res);
      } catch (_) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
      }
      res.status(404).json({ success: false, error: 'API route not found' });
      return;
    }
    await handler(req, res);
  } catch (error) {
    console.error(`API error on ${req.method} ${req.path}:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
});

app.use((req, res, next) => {
  if (req.path.includes('..') || req.path.startsWith('/node_modules')) {
    res.status(404).send('Not found');
    return;
  }
  next();
});

const distPath = path.join(__dirname, 'dist');
const hasReactBuild = fs.existsSync(path.join(distPath, 'index.html'));

if (hasReactBuild) {
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
}

app.use(
  express.static(__dirname, {
    extensions: ['html', 'htm'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

app.use((req, res) => {
  if (hasReactBuild && !req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log('Dynapharm API & static server running');
  console.log(`Listening on http://${HOST}:${PORT}`);
  if (process.env.DATABASE_URL) {
    console.log(`DATABASE_URL detected: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  } else {
    console.warn('DATABASE_URL not set. Database-backed APIs may fail.');
  }
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

(async () => {
  try {
    const { query, getOne } = await import('./api/db.js');
    await query('SELECT 1');
    console.log('Database connection verified');

    await query(`INSERT INTO warehouse_locations (id, name, code, type, status, created_at, updated_at)
      VALUES ('country_stock', 'Country Stock', 'CS', 'country', 'active', NOW(), NOW()),
             ('windhoek_warehouse', 'Windhoek Warehouse', 'WHK', 'warehouse', 'active', NOW(), NOW()),
             ('ondangwa_warehouse', 'Ondangwa Warehouse', 'OND', 'warehouse', 'active', NOW(), NOW()),
             ('ondangwa', 'Ondangwa', 'ONDG', 'warehouse', 'active', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`);

    const existingAdmin = await getOne("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE LIMIT 1");
    if (!existingAdmin) {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.default.hash('Admin@2024', 10);
      const adminId = 'USR-ADMIN-' + Date.now();
      await query(
        `INSERT INTO users (id, username, password_hash, role, full_name, email, is_active, must_change_password, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, 'admin', 'Super Admin', 'admin@dynapharm.na', TRUE, FALSE, '{"seeded":true}'::jsonb, NOW(), NOW())
         ON CONFLICT (username) DO NOTHING`,
        [adminId, 'admin', hash]
      );
      console.log('Super Admin account seeded (username: admin)');
    }

    // ── Branch ID normalization ─────────────────────────────────────────────
    // Canonical slug for every known display-name / alias variant.
    // Applied to branch_walkin_sales, stock_movements, branch_inventory_batches,
    // branch_inventory_movements, inventory_balances, and users.branch.
    const BRANCH_ALIAS_MAP = {
      'Windhoek CBD': 'townshop',  'windhoek cbd': 'townshop',
      'windhoek_cbd': 'townshop',
      'main': 'townshop',
      'Khomasdal': 'khomasdal',
      'Tsumeb': 'tsumeb',
      'Gobabis': 'gobabis',
      'Swakopmund': 'swakopmund',
      'Walvis Bay': 'walvisbay', 'walvis_bay': 'walvisbay', 'walvis bay': 'walvisbay',
      'Walvisbay': 'walvisbay',
      'Outapi': 'outapi',
      'Okahao': 'okahao',
      'Oshakati': 'oshakati_branch', 'oshakati': 'oshakati_branch',
      'Otjiwarongo': 'otjiwarongo',
      'Eenhana': 'eenhana',
      'Ondangwa': 'ondangwa',
      'Rundu': 'rundu',
      'Katima Mulilo': 'katima', 'katima mulilo': 'katima',
      'Hochlandpark': 'hochland-park', 'hochland_park': 'hochland-park',
      // Warehouse display names → warehouse slugs (for stock-role users)
      'Windhoek Warehouse': 'windhoek_warehouse', 'windhoek warehouse': 'windhoek_warehouse',
      'Ondangwa Warehouse': 'ondangwa_warehouse', 'ondangwa warehouse': 'ondangwa_warehouse',
      'Country Stock': 'country_stock', 'country stock': 'country_stock',
    };

    let branchMigrationsApplied = 0;
    for (const [alias, canonical] of Object.entries(BRANCH_ALIAS_MAP)) {
      const tables = [
        { table: 'branch_walkin_sales', col: 'branch_id' },
        { table: 'stock_movements', col: 'source_location' },
        { table: 'stock_movements', col: 'destination_location' },
        { table: 'branch_inventory_batches', col: 'branch_id' },
        { table: 'branch_inventory_movements', col: 'branch_id' },
        { table: 'inventory_balances', col: 'location_id' },
        { table: 'users', col: 'branch' },
        { table: 'appointments', col: 'branch' },
        { table: 'reports', col: 'branch' },
      ];
      for (const { table, col } of tables) {
        try {
          const r = await query(
            `UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`,
            [canonical, alias]
          );
          if (r && r.rowCount > 0) branchMigrationsApplied += r.rowCount;
        } catch {}
      }
    }
    if (branchMigrationsApplied > 0) {
      console.log(`Branch ID normalization: updated ${branchMigrationsApplied} rows`);
    }

    // ── Normalize status values: legacy 'completed' → 'posted' ─────────────
    // All new movements use 'posted'. Old records used 'completed'. Align them.
    const statusFix = await query(
      `UPDATE stock_movements SET status = 'posted' WHERE status = 'completed'`
    );
    if (statusFix && statusFix.rowCount > 0) {
      console.log(`Status normalization: updated ${statusFix.rowCount} stock_movements rows`);
    }

    // ── Schema sync: ensure columns added by later migrations exist ─────────
    // These ALTER TABLE … ADD COLUMN IF NOT EXISTS statements are idempotent.
    // They repair any production databases that were created before these
    // migrations were authored, without touching existing data.
    const schemaSyncs = [
      // Migration 019: GM dispatch approval columns on stock_transfers
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS prepared_by_id VARCHAR(255)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS prepared_by_role VARCHAR(100)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS destination_branch_staff JSONB`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_at TIMESTAMPTZ`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_by VARCHAR(255)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_approved_by_id VARCHAR(255)`,
      // Migration 020: CIF unit cost on stock_movements
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cif NUMERIC(14,4)`,
      // Campaigns extended schema
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(50) DEFAULT 'custom'`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'countrywide'`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}'`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS prize JSONB DEFAULT '{}'`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0`,
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_branches JSONB DEFAULT '[]'`,
      // Distributor referral tracking on branch walk-in sales
      `ALTER TABLE branch_walkin_sales ADD COLUMN IF NOT EXISTS referral_nb VARCHAR(50)`,
      `ALTER TABLE branch_walkin_sales ADD COLUMN IF NOT EXISTS distributor_nb VARCHAR(50)`,
      // CAS: finance_cash_requests updated_at column (unblocks Finance PATCH)
      `ALTER TABLE finance_cash_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    ];
    let schemaSynced = 0;
    for (const sql of schemaSyncs) {
      try { await query(sql); schemaSynced++; } catch {}
    }
    if (schemaSynced > 0) {
      console.log(`Schema sync: applied ${schemaSynced} column additions`);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Campaign participation and winners tables ─────────────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS campaign_participants (
          id VARCHAR(100) PRIMARY KEY,
          campaign_id VARCHAR(100) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          distributor_code VARCHAR(50) NOT NULL,
          distributor_name VARCHAR(255),
          branch VARCHAR(100),
          enrolled_at TIMESTAMPTZ DEFAULT NOW(),
          status VARCHAR(30) DEFAULT 'active',
          current_bv NUMERIC(12,2) DEFAULT 0,
          current_recruits INTEGER DEFAULT 0,
          notes TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_campaign_participants_campaign ON campaign_participants(campaign_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_campaign_participants_code ON campaign_participants(distributor_code)`);

      await query(`
        CREATE TABLE IF NOT EXISTS campaign_winners (
          id VARCHAR(100) PRIMARY KEY,
          campaign_id VARCHAR(100) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          distributor_code VARCHAR(50) NOT NULL,
          distributor_name VARCHAR(255),
          branch VARCHAR(100),
          prize_tier VARCHAR(255),
          prize_description TEXT,
          prize_rank INTEGER DEFAULT 1,
          won_at TIMESTAMPTZ DEFAULT NOW(),
          status VARCHAR(30) DEFAULT 'pending',
          verified_by VARCHAR(100),
          notes TEXT
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_campaign_winners_campaign ON campaign_winners(campaign_id)`);
    } catch (e) {
      console.warn('[campaign tables init]', e.message);
    }

    // ── Petty cash tables ────────────────────────────────────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS petty_cash_accounts (
          id VARCHAR(100) PRIMARY KEY,
          location VARCHAR(100) UNIQUE NOT NULL,
          balance NUMERIC(14,2) DEFAULT 0,
          last_topped_up_at TIMESTAMPTZ,
          last_topped_up_by VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS petty_cash_requests (
          id VARCHAR(100) PRIMARY KEY,
          request_number VARCHAR(100),
          amount NUMERIC(14,2) NOT NULL,
          purpose TEXT NOT NULL,
          location VARCHAR(100) DEFAULT 'head_office',
          status VARCHAR(50) DEFAULT 'pending_gm',
          requested_by VARCHAR(255),
          gm_approved_by VARCHAR(255),
          gm_approved_at TIMESTAMPTZ,
          issued_by VARCHAR(255),
          issued_at TIMESTAMPTZ,
          rejected_by VARCHAR(255),
          rejected_at TIMESTAMPTZ,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS petty_cash_transactions (
          id VARCHAR(100) PRIMARY KEY,
          location VARCHAR(100) NOT NULL,
          type VARCHAR(30) NOT NULL,
          amount NUMERIC(14,2) NOT NULL,
          description TEXT,
          category VARCHAR(100),
          branch_id VARCHAR(100),
          reference_id VARCHAR(100),
          performed_by VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_pct_location ON petty_cash_transactions(location)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_pct_type ON petty_cash_transactions(type)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_pcr_status ON petty_cash_requests(status)`);
    } catch (e) {
      console.warn('[petty cash tables init]', e.message);
    }
    // ── Distributor bonus tables ──────────────────────────────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS distributor_bonuses (
          id TEXT PRIMARY KEY,
          period TEXT NOT NULL,
          distributor_id TEXT,
          nb_number TEXT NOT NULL,
          distributor_name TEXT NOT NULL,
          amount_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
          amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
          paid_by_branch_id TEXT,
          payment_date DATE,
          status TEXT NOT NULL DEFAULT 'pending',
          uploaded_by TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_dist_bonuses_nb ON distributor_bonuses (nb_number)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_dist_bonuses_period ON distributor_bonuses (period)`);
      await query(`
        CREATE TABLE IF NOT EXISTS distributor_bonus_payments (
          id TEXT PRIMARY KEY,
          bonus_id TEXT NOT NULL REFERENCES distributor_bonuses(id) ON DELETE CASCADE,
          branch_id TEXT NOT NULL,
          amount NUMERIC(14,2) NOT NULL,
          paid_at DATE NOT NULL,
          recorded_by TEXT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_dist_bonus_payments_bonus_id ON distributor_bonus_payments (bonus_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_dist_bonus_payments_branch ON distributor_bonus_payments (branch_id)`);
    } catch (e) {
      console.warn('[distributor bonus tables init]', e.message);
    }
    // ────────────────────────────────────────────────────────────────────────
    // ── Normalize appointment branch display names → branch IDs (idempotent) ──
    try {
      const aptNorm = await query(
        `UPDATE appointments a
         SET branch = b.id
         FROM branches b
         WHERE LOWER(a.branch) = LOWER(b.name)
           AND a.branch IS DISTINCT FROM b.id`
      );
      if (aptNorm && aptNorm.rowCount > 0) {
        console.log(`Appointment branch normalization: updated ${aptNorm.rowCount} records`);
      }
    } catch (e) {
      console.warn('[appointment branch norm]', e.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Backfill reports.branch from linked appointments (one-time, idempotent) ─
    try {
      const branchNameToId = {
        'Windhoek CBD': 'townshop', 'townshop': 'townshop',
        'Oshakati': 'oshakati_branch', 'oshakati_branch': 'oshakati_branch', 'oshakati': 'oshakati_branch',
        'Hochlandpark': 'hochland-park', 'hochland-park': 'hochland-park',
        'Walvis Bay': 'walvisbay', 'walvisbay': 'walvisbay',
        'Katima Mulilo': 'katima', 'katima': 'katima',
        'Gobabis': 'gobabis', 'gobabis': 'gobabis',
        'Eenhana': 'eenhana', 'eenhana': 'eenhana',
        'Ondangwa': 'ondangwa', 'ondangwa': 'ondangwa',
        'Otjiwarongo': 'otjiwarongo', 'otjiwarongo': 'otjiwarongo',
        'Swakopmund': 'swakopmund', 'swakopmund': 'swakopmund',
        'Khomasdal': 'khomasdal', 'khomasdal': 'khomasdal',
        'Rundu': 'rundu', 'rundu': 'rundu',
        'Tsumeb': 'tsumeb', 'tsumeb': 'tsumeb',
        'Okahao': 'okahao', 'okahao': 'okahao',
        'Outapi': 'outapi', 'outapi': 'outapi',
      };
      const bfResult = await query(
        `SELECT r.id, a.branch as apt_branch
         FROM reports r
         JOIN appointments a ON a.id = r.data->>'appointment_id'
         WHERE r.branch IS NULL AND a.branch IS NOT NULL`
      );
      const nullBranchReports = bfResult?.rows || [];
      let backfilled = 0;
      for (const row of nullBranchReports) {
        const branchId = branchNameToId[row.apt_branch] || row.apt_branch;
        if (branchId) {
          await query(`UPDATE reports SET branch = $1 WHERE id = $2`, [branchId, row.id]);
          backfilled++;
        }
      }
      if (backfilled > 0) console.log(`Reports branch backfill: updated ${backfilled} records`);
    } catch (e) {
      console.warn('[reports backfill]', e.message);
    }

    // ── Normalize reports.branch display names → branch IDs ─────────────────
    // Catches reports stored as "Oshakati", "Windhoek CBD", etc. instead of
    // the canonical ID ("oshakati_branch", "townshop", …).
    try {
      const branchNameToId = {
        'Windhoek CBD': 'townshop', 'townshop': 'townshop', 'windhoek cbd': 'townshop',
        'Oshakati': 'oshakati_branch', 'oshakati_branch': 'oshakati_branch', 'oshakati': 'oshakati_branch',
        'Hochlandpark': 'hochland-park', 'hochland-park': 'hochland-park', 'hochland park': 'hochland-park',
        'Walvis Bay': 'walvisbay', 'walvisbay': 'walvisbay', 'walvis bay': 'walvisbay',
        'Katima Mulilo': 'katima', 'katima': 'katima', 'katima mulilo': 'katima',
        'Gobabis': 'gobabis', 'gobabis': 'gobabis',
        'Eenhana': 'eenhana', 'eenhana': 'eenhana',
        'Ondangwa': 'ondangwa', 'ondangwa': 'ondangwa',
        'Otjiwarongo': 'otjiwarongo', 'otjiwarongo': 'otjiwarongo',
        'Swakopmund': 'swakopmund', 'swakopmund': 'swakopmund',
        'Khomasdal': 'khomasdal', 'khomasdal': 'khomasdal',
        'Rundu': 'rundu', 'rundu': 'rundu',
        'Tsumeb': 'tsumeb', 'tsumeb': 'tsumeb',
        'Okahao': 'okahao', 'okahao': 'okahao',
        'Outapi': 'outapi', 'outapi': 'outapi',
      };
      const canonicalIds = new Set(Object.values(branchNameToId));
      // Fetch all reports whose branch is NOT already a canonical ID
      const { rows: nonCanonical } = await query(
        `SELECT id, branch FROM reports WHERE branch IS NOT NULL AND branch != ''`
      );
      let normalised = 0;
      for (const row of nonCanonical) {
        if (canonicalIds.has(row.branch)) continue; // already correct
        const mapped = branchNameToId[row.branch] || branchNameToId[(row.branch || '').toLowerCase()];
        if (mapped && mapped !== row.branch) {
          await query(`UPDATE reports SET branch = $1 WHERE id = $2`, [mapped, row.id]);
          normalised++;
        }
      }
      if (normalised > 0) console.log(`Reports branch normalisation: fixed ${normalised} display-name records`);
    } catch (e) {
      console.warn('[reports branch normalise]', e.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Auto-seed inventory_balances if empty ───────────────────────────────
    const ibCount = await getOne(`SELECT COUNT(*) as cnt FROM inventory_balances`);
    if (Number(ibCount?.cnt || 0) === 0) {
      try {
        const { seedInventoryBalances } = await import('./api/services/stockEngine.js');
        const seedResult = await seedInventoryBalances();
        console.log(`inventory_balances seeded: ${seedResult.seeded || 0} balances (${seedResult.errors || 0} errors)`);
      } catch (seedErr) {
        console.warn('inventory_balances seed failed:', seedErr.message);
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Mark all NULL-status stock_movements as 'posted' ────────────────────
    // Historical records created before the status field was enforced have
    // status = NULL.  The stockEngine only counts 'posted' movements, so
    // these must be promoted before any balance recompute.
    try {
      const nullMovFix = await query(
        `UPDATE stock_movements SET status = 'posted'
         WHERE (status IS NULL OR status = '') AND movement_type IS NOT NULL`
      );
      if (nullMovFix && nullMovFix.rowCount > 0) {
        console.log(`[startup] Promoted ${nullMovFix.rowCount} NULL-status stock_movements to 'posted'`);
      }
    } catch (nmErr) {
      console.warn('[startup NULL-status fix]', nmErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Restore branch_inventory_batches.quantity from movement logs ─────────
    // The previous (now-removed) sync job overwrote correct physical quantities
    // with stale inventory_balances values (which missed unposted transfers).
    // Rebuild quantities from branch_inventory_movements for any row showing 0.
    try {
      const restoreResult = await query(
        `UPDATE branch_inventory_batches bib
         SET quantity = GREATEST(net.net_qty, 0),
             status   = CASE WHEN GREATEST(net.net_qty, 0) > 0 THEN 'in_stock' ELSE 'out_of_stock' END,
             updated_at = NOW()
         FROM (
           SELECT
             bim.branch_id,
             LOWER(TRIM(bim.product_name)) AS norm_product,
             bim.batch_no,
             SUM(CASE
               WHEN bim.type IN ('receive','transfer_in','purchase','return') THEN bim.quantity
               WHEN bim.type IN ('dispense','transfer_out','sold','sale','write_off') THEN -bim.quantity
               ELSE 0
             END) AS net_qty
           FROM branch_inventory_movements bim
           GROUP BY bim.branch_id, LOWER(TRIM(bim.product_name)), bim.batch_no
         ) net
         WHERE bib.branch_id = net.branch_id
           AND LOWER(TRIM(bib.product_name)) = net.norm_product
           AND bib.batch_no IS NOT DISTINCT FROM net.batch_no
           AND bib.quantity = 0
           AND net.net_qty > 0`
      );
      if (restoreResult && restoreResult.rowCount > 0) {
        console.log(`[startup] Restored quantities for ${restoreResult.rowCount} branch_inventory_batches rows from movement log`);
      }
    } catch (restErr) {
      console.warn('[startup quantity restore]', restErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Backfill branch_inventory_batches from inventory_balances ───────────
    // Any branch stock that arrived via the centralized stockEngine path
    // is imported here so the branch portal can see it.
    // Uses bare ON CONFLICT DO NOTHING (no target) to suppress ALL conflicts
    // (both PK and unique-index) — fully idempotent across restarts.
    try {
      const bfBatch = await query(
        `INSERT INTO branch_inventory_batches
           (id, branch_id, product_name, batch_no, expiry_date, quantity, unit_price, status, created_at, updated_at)
         SELECT
           'BIB-IB-' || ib.id AS id,
           ib.location_id AS branch_id,
           ib.product_name,
           ib.batch_no,
           ib.expiry_date,
           GREATEST(ib.closing_qty, 0) AS quantity,
           ib.unit_dp AS unit_price,
           CASE WHEN GREATEST(ib.closing_qty, 0) > 0 THEN 'in_stock' ELSE 'out_of_stock' END AS status,
           COALESCE(ib.updated_at, NOW()) AS created_at,
           COALESCE(ib.updated_at, NOW()) AS updated_at
         FROM inventory_balances ib
         WHERE ib.location_type = 'branch'
           AND GREATEST(ib.closing_qty, 0) > 0
         ON CONFLICT DO NOTHING`
      );
      if (bfBatch && bfBatch.rowCount > 0) {
        console.log(`branch_inventory_batches backfill: inserted ${bfBatch.rowCount} rows from inventory_balances`);
      }
    } catch (bfErr) {
      console.warn('[branch_inventory_batches backfill]', bfErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── Start automated stock reporting scheduler ────────────────────────────
    try {
      const { startStockScheduler, ensureStockSummaryTable } = await import('./api/services/stockScheduler.js');
      await ensureStockSummaryTable();
      startStockScheduler();
    } catch (schedErr) {
      console.warn('Stock scheduler startup warning:', schedErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────

    const staffUsers = [
      { id: 'USR1759829667953', username: 'moses', password: 'walker33', fullName: 'MOSES MUKISA', email: 'mosesmukisa1@gmail.com', phone: '0817317160', role: 'consultant', branch: 'townshop' },
      { id: 'USR1759829814781', username: 'Geneva', password: 'Pearl_11', fullName: 'Jennifer Joseph', email: 'shange1124@gmail.com', phone: '0852803618', role: 'consultant', branch: 'townshop' },
      { id: 'USR1759830625722', username: 'NAEM', password: 'PASSWORD', fullName: 'NAEM HANGULA', email: 'naemhangula4@gmail.com', phone: '0817499757', role: 'dispenser', branch: 'townshop' },
      { id: 'USR1759928153488', username: 'GEINGOS', password: 'ALBERTO99', fullName: 'HILMA C', email: 'geingoshilma@gmail', phone: '0814137106', role: 'consultant', branch: 'townshop' },
      // Finance & GM portal access accounts — admin must change these passwords immediately after first login
      { id: 'USR_FINANCE_001', username: 'finance', password: 'Finance@2025', fullName: 'Finance Officer', email: 'finance@dynapharm.com.na', phone: '', role: 'finance', branch: 'townshop', mustChangePassword: true },
      { id: 'USR_GM_001', username: 'gm', password: 'GM@2025', fullName: 'General Manager', email: 'gm@dynapharm.com.na', phone: '', role: 'gm', branch: 'townshop', mustChangePassword: true },
    ];
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('DEFAULT PORTAL CREDENTIALS (change immediately via Admin panel)');
    console.log('  Finance portal: username=finance  password=Finance@2025');
    console.log('  GM portal:      username=gm       password=GM@2025');
    console.log('  [must_change_password=true — staff will be prompted to reset]');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const bcryptMod = await import('bcryptjs');
    for (const u of staffUsers) {
      const exists = await getOne("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [u.username]);
      if (!exists) {
        const pwHash = await bcryptMod.default.hash(u.password, 10);
        const mustChange = u.mustChangePassword === true;
        await query(
          `INSERT INTO users (id, username, password_hash, role, full_name, email, phone, branch, is_active, must_change_password, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, '{"seeded":true}'::jsonb, NOW(), NOW())
           ON CONFLICT (username) DO NOTHING`,
          [u.id, u.username, pwHash, u.role, u.fullName, u.email, u.phone, u.branch, mustChange]
        );
        if (mustChange) {
          console.log(`Seeded privileged user: ${u.username} (${u.role}) — default password must be changed on first login`);
        } else {
          console.log('Seeded staff user:', u.username, '(' + u.role + ')');
        }
      }
    }
  } catch (error) {
    console.warn('Database startup check failed:', error.message);
  }
})();
