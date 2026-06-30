import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';

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

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Client-side error logging
app.post('/api/client-error', (req, res) => {
  const { message, stack, componentStack, url } = req.body || {};
  console.error('[CLIENT ERROR]', { message, url });
  if (stack) console.error('[CLIENT STACK]', stack.slice(0, 800));
  if (componentStack) console.error('[COMPONENT STACK]', componentStack.slice(0, 400));
  res.json({ ok: true });
});

// Serve uploaded files (videos, images, documents) — no auth required to stream
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp4', '.webm', '.ogg', '.mov'].includes(ext)) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
  },
}));

// Serve files from Replit persistent object storage — new uploads go here
let _objClient = null;
async function getStorageClient() {
  if (_objClient) return _objClient;
  const { Client } = await import('@replit/object-storage');
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  _objClient = new Client(bucketId ? { bucketId } : undefined);
  return _objClient;
}

// Temp-file path cache: objectName → { tmpPath, ts }
const _videoTmpCache = new Map();
const VIDEO_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Periodically evict expired temp-file cache entries and delete the files
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _videoTmpCache) {
    if (now - val.ts > VIDEO_CACHE_TTL) {
      _videoTmpCache.delete(key);
      fs.unlink(val.tmpPath, () => {});
    }
  }
}, 15 * 60 * 1000);

app.get('/api/obj/*', async (req, res) => {
  try {
    const client = await getStorageClient();
    const objectName = req.path.replace(/^\/api\/obj\//, '');
    if (!objectName) return res.status(400).json({ error: 'No object path specified' });

    const ext = path.extname(objectName).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/mp4',
      '.ogg': 'video/ogg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const isVideo = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.3gp'].includes(ext);

    const existsResult = await client.exists(objectName);
    if (!existsResult.ok || !existsResult.value) {
      console.warn('[obj-serve] not found in storage:', objectName);
      return res.status(404).json({ error: 'File not found in storage' });
    }

    if (isVideo) {
      // For video: download to a temp file on disk so res.sendFile can serve it with
      // full HTTP Range request support (206 Partial Content) — required by iOS Safari
      // and all other mobile players to seek and play correctly.
      let tmpPath;
      const cached = _videoTmpCache.get(objectName);
      if (cached && Date.now() - cached.ts < VIDEO_CACHE_TTL && fs.existsSync(cached.tmpPath)) {
        tmpPath = cached.tmpPath;
        console.log('[obj-serve] serving video from disk cache:', objectName);
      } else {
        tmpPath = path.join(os.tmpdir(), `dynapharm_vid_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
        console.log('[obj-serve] downloading video to disk:', objectName);
        const result = await client.downloadToFilename(objectName, tmpPath);
        if (!result.ok) {
          console.error('[obj-serve] downloadToFilename failed for:', objectName, result.error);
          return res.status(500).json({ error: 'Failed to download video from storage' });
        }
        _videoTmpCache.set(objectName, { tmpPath, ts: Date.now() });
        console.log('[obj-serve] video cached on disk:', tmpPath);
      }

      // res.sendFile handles Range requests (206 Partial Content) automatically.
      // This is what iOS Safari / all mobile browsers require to play video.
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(tmpPath, { headers: { 'Content-Type': contentType } }, (err) => {
        if (err) {
          console.error('[obj-serve] sendFile error:', err.message);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream video' });
        }
      });
    } else {
      // Non-video: stream directly from object storage
      const fileStream = await client.downloadAsStream(objectName);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      fileStream.pipe(res);
    }
  } catch (err) {
    console.error('[obj-serve] error:', err.message, err.stack?.split('\n')[1]);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to serve file' });
  }
});

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
  '/api/distributor-statements',
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
  '/api/obj/',
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
    let sql = `SELECT l.id,
                      l.employee_id AS staff,
                      COALESCE(l.employee_name, u.full_name, l.employee_id) AS "staffName",
                      COALESCE(u.branch, e.branch, '') AS branch,
                      COALESCE(u.role, e.position, '') AS "staffRole",
                      l.leave_type AS type,
                      l.start_date AS "startDate",
                      l.end_date AS "endDate",
                      l.reason,
                      INITCAP(l.status) AS status,
                      COALESCE(l.urgent, false) AS urgent,
                      l.created_at AS "submittedAt",
                      l.approved_by AS "approvedBy",
                      l.approved_at AS "approvedAt",
                      l.notes
               FROM hr_leave_requests l
               LEFT JOIN users u
                 ON LOWER(TRIM(u.username)) = LOWER(TRIM(l.employee_id))
                 OR LOWER(TRIM(u.id::text)) = LOWER(TRIM(l.employee_id))
               LEFT JOIN employees e
                 ON LOWER(TRIM(e.full_name)) = LOWER(TRIM(l.employee_name))`;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`LOWER(l.status) = LOWER($${params.length})`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY l.created_at DESC LIMIT 500';
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
      `SELECT id, request_number AS "requestNumber", requested_by AS staff,
              branch,
              COALESCE(data->>'expenseCategory', 'General') AS "expenseCategory",
              CAST(amount AS TEXT) AS amount, purpose,
              INITCAP(status) AS status,
              data->>'neededBy' AS "neededBy",
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
    const { amount, purpose, neededBy, expenseCategory } = req.body;
    if (!amount || !purpose) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const reqNum = 'CAS-' + Date.now();
    const branchName = req.user?.branch || 'unknown';
    await query(
      `INSERT INTO finance_cash_requests (id, request_number, branch, amount, purpose, status, requested_by, created_at, data)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), $7::jsonb)`,
      [
        'CAS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        reqNum,
        branchName,
        parseFloat(amount),
        purpose,
        username,
        JSON.stringify({ submittedByName: staffName, expenseCategory: expenseCategory || 'General', neededBy: neededBy || null }),
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
    // JOIN users to resolve requester full name, role, and branch
    let sql = `SELECT r.id, r.request_number, r.branch, r.amount, r.purpose, r.status,
                      r.requested_by,
                      COALESCE(u.full_name, r.data->>'submittedByName', r.data->>'staffName', r.requested_by) AS submitted_by_name,
                      COALESCE(r.data->>'expenseCategory', 'General') AS expense_category,
                      r.data->>'neededBy'    AS needed_by,
                      r.data->>'financeNote' AS finance_note,
                      r.data->>'gmNote'      AS gm_note,
                      r.data->>'reviewedBy'  AS reviewed_by,
                      r.data->>'gmApprovedBy' AS gm_approved_by,
                      r.created_at, r.updated_at
               FROM finance_cash_requests r
               LEFT JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(r.requested_by))`;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`r.status = $${params.length}`); }
    if (branch) { params.push(branch); conds.push(`r.branch = $${params.length}`); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY r.created_at DESC';
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

// ── Department Expenses (Cleaners, Security, Support Staff) ───────────────────
app.get('/api/dept-expenses', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const role = req.user?.role || '';
    const adminRoles = ['admin', 'finance', 'gm', 'director', 'hr_manager', 'hr'];
    let rows;
    if (adminRoles.includes(role)) {
      const { department } = req.query;
      let sql = 'SELECT * FROM dept_expenses';
      const params = [];
      if (department) { params.push(department); sql += ' WHERE department = $1'; }
      sql += ' ORDER BY created_at DESC LIMIT 500';
      ({ rows } = await query(sql, params));
    } else {
      ({ rows } = await query(
        'SELECT * FROM dept_expenses WHERE LOWER(submitted_by) = $1 ORDER BY created_at DESC',
        [username]
      ));
    }
    res.json({ success: true, expenses: rows });
  } catch (err) {
    console.error('dept-expenses GET:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/dept-expenses', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const { department, category, amount, description, date, receipt_ref } = req.body;
    if (!department || !category || !amount || !description) {
      return res.status(400).json({ success: false, error: 'Department, category, amount, and description are required' });
    }
    const { rows } = await query(
      `INSERT INTO dept_expenses (submitted_by, department, category, amount, description, date, receipt_ref, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW()) RETURNING *`,
      [username, department, category, Number(amount), description, date || new Date().toISOString().slice(0, 10), receipt_ref || null]
    );
    res.status(201).json({ success: true, expense: rows[0] });
  } catch (err) {
    console.error('dept-expenses POST:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/dept-expenses/:id', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    const adminRoles = ['admin', 'finance', 'gm', 'director', 'hr_manager', 'hr'];
    if (!adminRoles.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const actorName = req.user?.full_name || req.user?.username || role;
    const { rows } = await query(
      `UPDATE dept_expenses SET status=$1, reviewed_by=$2, reviewed_at=NOW(), notes=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, actorName, notes || null, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, expense: rows[0] });
  } catch (err) {
    console.error('dept-expenses PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stock Adjustment Requests (requires GM approval) ──────────────────────────
app.get('/api/stock-adjustments', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { status, target_id } = req.query;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`sa.status = $${params.length}`); }
    if (target_id) { params.push(target_id); conds.push(`sa.target_id = $${params.length}`); }
    const whereClause = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const sql = `SELECT sa.*,
      COALESCE(
        CASE WHEN sa.requested_by_name IS NOT NULL AND sa.requested_by_name != sa.requested_by THEN sa.requested_by_name END,
        u.full_name, u.username, sa.requested_by_name, sa.requested_by
      ) AS requested_by_name
      FROM stock_adjustments sa
      LEFT JOIN users u ON u.id::text = sa.requested_by OR (u.username = sa.requested_by AND sa.requested_by NOT LIKE '%-%-%-%-%')
      ${whereClause}
      ORDER BY sa.created_at DESC`;
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
    const requested_by = req.user?.username || req.user?.sub || 'unknown';
    const requested_by_name = req.user?.fullName || req.user?.full_name || req.user?.name || requested_by;
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
    // 'quantity' intentionally maps to 'remaining_quantity': when a user requests a quantity
    // correction they mean current stock on hand, not the original received total.
    const batchColumnMap = {
      batch_number: 'batch_no',
      quantity: 'remaining_quantity',
      remaining_quantity: 'remaining_quantity',
      expiry_date: 'expiry_date',
      unit_price: 'unit_price',
      dpc_unit_value: 'dpc_unit_value',
      notes: 'notes',
    };

    if (target_id && field_to_adjust) {
      if (['import', 'country_stock', 'warehouse'].includes(target_type)) {
        const dbCol = batchColumnMap[field_to_adjust];
        if (!dbCol) return res.status(400).json({ error: `Field '${field_to_adjust}' is not adjustable` });

        const qtyDelta = field_to_adjust === 'quantity' ? Number(new_value) - Number(adj.old_value || 0) : 0;

        if (field_to_adjust === 'quantity') {
          // Update both remaining_quantity AND quantity (by the same delta) so the
          // invariant  remaining = quantity - dispatched_quantity  always holds.
          // Without bumping quantity, the startup reconciliation detects
          // remaining > (quantity - dispatched) and reverts the approved edit on
          // every server restart.  'positive_adjustment' is already in the
          // reconciliation exclusion list, so the audit movement won't re-trigger it.
          await query(
            `UPDATE stock_batches
             SET remaining_quantity = $1,
                 quantity           = GREATEST(quantity + $2, $1),
                 updated_at         = NOW()
             WHERE id = $3`,
            [Number(new_value), qtyDelta, target_id]
          );
        } else {
          await query(`UPDATE stock_batches SET ${dbCol} = $1, updated_at = NOW() WHERE id = $2`, [new_value, target_id]);
        }

        // Log to stock_movements (no ON CONFLICT — use unique movement id)
        // Use 'positive_adjustment' (excluded from the startup reconciliation query)
        // so the audit entry never re-triggers a recalculation of remaining_quantity.
        const movId = 'MOV-ADJ-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
        try {
          await query(
            `INSERT INTO stock_movements (id, product_name, quantity, movement_type, source_location, destination_location, reference_id, notes, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,'positive_adjustment',$4,$4,$5,$6,$7,NOW(),NOW())`,
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
    // Atomic idempotency guard: the WHERE clause rejects the UPDATE if the request
    // is already in 'received' status, eliminating the race window of a separate
    // SELECT-then-UPDATE check. rowCount===0 means it was already received.
    const guardClause = status === 'received' ? `AND status != 'received'` : '';
    const updateResult = await query(
      `UPDATE stock_requests SET status=$1, notes=COALESCE($2, notes), approved_by=$3, approved_at=NOW(), updated_at=NOW(), last_status_change=NOW() WHERE id=$4 ${guardClause}`,
      [status, notes || null, actorName, id]
    );
    if (status === 'received' && updateResult.rowCount === 0) {
      return res.status(409).json({ error: 'This stock request has already been received.' });
    }
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

// CIF breakdown data from official price list PDF (before August 2026)
// Keys are normalized descriptions matching STATIC_PRICE_LIST entries
const CIF_DATA = {
  "ARABICA COFFEE MIX W/GOAT'S AND GANO 25GX20'S":          { code:'NB1208',   orig:120,  vat:15, duty:20, clearing:1 },
  "BEE POLLEN CAPSULE (30'S)":                               { code:'NB3801',   orig:75,   vat:15, duty:0,  clearing:1 },
  "BEE POLLEN CAPSULE (100'S)":                              { code:'NB3802',   orig:158,  vat:15, duty:0,  clearing:1 },
  "BODY CONTOUR CREAM":                                      { code:'NB7825',   orig:162,  vat:15, duty:20, clearing:1 },
  "COMPACT POWDER 12G":                                      { code:'NB7859',   orig:108,  vat:15, duty:20, clearing:1 },
  "D.I GROW (GREEN) (1 LITER)":                              { code:'NB9845',   orig:98,   vat:15, duty:0,  clearing:1 },
  "D.I GROW (GREEN) (4LITERS)":                              { code:'NB9830',   orig:328,  vat:15, duty:0,  clearing:1 },
  "D.I GROW (RED) (1 LITER)":                               { code:'NB9846',   orig:98,   vat:15, duty:0,  clearing:1 },
  "D.I GROW (RED) (4LITERS)":                               { code:'NB9829',   orig:328,  vat:15, duty:0,  clearing:1 },
  "D.I GROW BIO-8 1 LTR":                                   { code:'NB9848',   orig:135,  vat:15, duty:0,  clearing:1 },
  "D.I GROW K 1 LTR":                                       { code:'NB9850',   orig:158,  vat:15, duty:0,  clearing:1 },
  "D.I. INSTANT GOAT'S MILK POWDER PREMIX 20'S X 21G":      { code:'NB2814',   orig:135,  vat:15, duty:25, clearing:1 },
  "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25G X 20'":     { code:'NB2813',   orig:113,  vat:15, duty:10, clearing:1 },
  "DI LIQUID ALFALFA PLUS GUARANA (500ML)":                  { code:'NB1802A',  orig:141,  vat:15, duty:20, clearing:1 },
  "DI LIQUID ALFALFAPLUS GUARANA (150ML)":                   { code:'NB1801A',  orig:53,   vat:15, duty:20, clearing:1 },
  "DI NONI 500ML":                                           { code:'NB5802N',  orig:225,  vat:15, duty:0,  clearing:1 },
  "DI NONI JUICE 1 L":                                       { code:'NB5802A',  orig:352,  vat:15, duty:0,  clearing:1 },
  "DYNA C- 100 TABLET 150'S":                                { code:'NB3805',   orig:78,   vat:15, duty:0,  clearing:1 },
  "DYNA C- 250 TABLET 90'S":                                 { code:'NB3806',   orig:78,   vat:15, duty:0,  clearing:1 },
  "DYNA 'S' TABLET 120'S":                                   { code:'NB5806',   orig:145,  vat:15, duty:0,  clearing:1 },
  "DYNA SERENOA TABLET 100'S":                               { code:'NB9918',   orig:235,  vat:15, duty:0,  clearing:1 },
  "DYNA SERENOA TABLET 30'S":                                { code:'NB9919',   orig:91,   vat:15, duty:0,  clearing:1 },
  "DYNA TONIC (150ML)":                                      { code:'NB3803',   orig:75,   vat:15, duty:20, clearing:1 },
  "DYNA TONIC (780ML)":                                      { code:'NB3804',   orig:230,  vat:15, duty:20, clearing:1 },
  "DYNA TOOTHBRUSH (SET 3 OF 3)":                            { code:'NB7833',   orig:45,   vat:15, duty:10, clearing:1 },
  "DYNA-RH CAPSULE 100'S":                                   { code:'NB6803',   orig:145,  vat:15, duty:0,  clearing:1 },
  "E-VITA CREAM (50G)":                                      { code:'NB7816',   orig:412,  vat:15, duty:20, clearing:1 },
  "GANODERMA LOTION 150ML":                                  { code:'NB7916',   orig:86,   vat:15, duty:20, clearing:1 },
  "GANODERMA SHOWER GEL 150ML(GANODERMA BODY SCRUB)":       { code:'NB7920',   orig:98,   vat:15, duty:20, clearing:1 },
  "GANODERMA SOAP 2 X 100G":                                 { code:'NB7839',   orig:75,   vat:15, duty:20, clearing:1 },
  "GANODERMA TOOTHPASTE (150G)":                             { code:'NB7919',   orig:60,   vat:15, duty:20, clearing:1 },
  "GINALI CAPSULE 100'S":                                    { code:'NB4811',   orig:165,  vat:15, duty:0,  clearing:1 },
  "GINALI CAPSULE 30'S":                                     { code:'NB4812',   orig:90,   vat:15, duty:0,  clearing:1 },
  "GINSENG CAPSULE 9 X 10'S":                                { code:'NB4805',   orig:260,  vat:15, duty:0,  clearing:1 },
  "GOAT'S MILK SOAP (100G)":                                 { code:'NB7834',   orig:45,   vat:15, duty:20, clearing:1 },
  "GOAT'S MILK TABLET 150'S":                                { code:'NB2802',   orig:110,  vat:15, duty:0,  clearing:1 },
  "GOAT'S MILK TABLET 75'S":                                 { code:'NB2803',   orig:65,   vat:15, duty:0,  clearing:1 },
  "GREEN TEA CAPSULE 30'S":                                  { code:'NB3811',   orig:90,   vat:15, duty:0,  clearing:1 },
  "GREEN TEA CAPSULE 60'S":                                  { code:'NB3812',   orig:172,  vat:15, duty:0,  clearing:1 },
  "HERBA WARISAN MAHARANI 6 X 10G":                          { code:'NB2812',   orig:230,  vat:15, duty:20, clearing:1 },
  "HIGH FIBER NUTRITION FOOD 30'SX25G":                      { code:'NB5807',   orig:330,  vat:15, duty:0,  clearing:1 },
  "INSTANT CAPPUCCINO W/ GANO 15'S X 35G":                  { code:'NB1205',   orig:113,  vat:15, duty:20, clearing:1 },
  "INSTANT CEREAL 15'S X 32G":                               { code:'NB5801N',  orig:143,  vat:15, duty:10, clearing:1 },
  "INSTANT CEREAL 30'S X 32G":                               { code:'NB5801',   orig:255,  vat:15, duty:10, clearing:1 },
  "INSTANT CHOC W/ GANO 30'S X 30G":                        { code:'NB1814',   orig:150,  vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP":       { code:'NB1203',   orig:88,   vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'SX21G)":   { code:'NB1204',   orig:88,   vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE MIX WITH GANODERMA 4-IN-1(SACHET) (20'S X 21G)": { code:'NB1804', orig:88, vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE W/ GANO, GREEN TEA 20'S X 21G":           { code:'NB1202',   orig:105,  vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE W/ GINKGO & GINSENG 20'S X 21G":          { code:'NB1201',   orig:105,  vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE W/ TONGKAT ALI 20'S X 21G":               { code:'NB4810',   orig:88,   vat:15, duty:20, clearing:1 },
  "INSTANT COFFEE W/GANO & TONGKAT ALI BLACK 30'S X 5G":    { code:'NB1818',   orig:120,  vat:15, duty:20, clearing:1 },
  "INSTANT GINSENG HONEY GINGER 500G":                       { code:'NB4803',   orig:129,  vat:15, duty:20, clearing:1 },
  "INSTANT PEGAGA CAFE 25G X 15S":                           { code:'NB1206',   orig:97,   vat:15, duty:20, clearing:1 },
  "INSTANT PREMIX COFFEE WITH MANGOSTEEN(25'SX15G)":         { code:'NB1210',   orig:115,  vat:15, duty:20, clearing:1 },
  "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G":            { code:'NB1812',   orig:102,  vat:15, duty:20, clearing:1 },
  "MILK TEA WITH TONGKAT ALI 21G X 20'S":                    { code:'NB4810N',  orig:103,  vat:15, duty:20, clearing:1 },
  "MILK THISTLE TABLET 120'S":                               { code:'NB4817',   orig:250,  vat:15, duty:0,  clearing:1 },
  "MILK THISTLE TABLET 30'S":                                { code:'NB4816',   orig:77,   vat:15, duty:0,  clearing:1 },
  "MINERAL POT":                                             { code:'NB8805',   orig:675,  vat:15, duty:20, clearing:1 },
  "NANO HOME FEMININE WASH ANTISEPTIC W/ SIRIH 60ML":        { code:'NB7842',   orig:35,   vat:15, duty:20, clearing:1 },
  "NANO HOME FEMININE WASH KACIP FATIMAH 60ML":              { code:'NB7841',   orig:36,   vat:15, duty:20, clearing:1 },
  "NANO HOME FEMININE WASH WITH GAMAT 60ML":                 { code:'NB7843',   orig:35,   vat:15, duty:20, clearing:1 },
  "NANO HOME GAMAT SOAP 100G":                               { code:'NB7840',   orig:41,   vat:15, duty:20, clearing:1 },
  "NANO HOME PEGAGA SOAP 100G":                              { code:'NB7838',   orig:31,   vat:15, duty:20, clearing:1 },
  "NONI PLUS TEA 30'S X 3G":                                 { code:'NB5803',   orig:145,  vat:15, duty:20, clearing:1 },
  "NUTMEG OINTMENT (2'S X 20G)":                             { code:'NB6802',   orig:85,   vat:15, duty:20, clearing:1 },
  "PRESIDENT'S CHOICE 4 IN 1 AND CHOCOLATE COFFEE 20'":     { code:'NB1817',   orig:135,  vat:15, duty:20, clearing:1 },
  "PRO- LSB TABLET 150'S":                                   { code:'NB2809',   orig:225,  vat:15, duty:0,  clearing:1 },
  "PROLINK 20'S X 20G":                                      { code:'NB3814',   orig:294,  vat:15, duty:20, clearing:1 },
  "PROLINK 30'S X 20G":                                      { code:'NB3816N',  orig:382,  vat:15, duty:20, clearing:1 },
  "RED COFFEE W/ GINSENG (12'S X 25G)":                     { code:'NB3810',   orig:90,   vat:15, duty:20, clearing:1 },
  "REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)":      { code:'NB10804',  orig:375,  vat:15, duty:20, clearing:1 },
  "REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)":     { code:'NB10805A', orig:375,  vat:15, duty:20, clearing:1 },
  "SEA CUCUMBER JELLY (250ML)":                              { code:'NB4808',   orig:125,  vat:15, duty:20, clearing:1 },
  "SEA CUCUMBER JELLY (500ML)":                              { code:'NB4808A',  orig:227,  vat:15, duty:20, clearing:1 },
  "SEA WATER SPIRULINA POWDER 500G":                         { code:'NB2805',   orig:141,  vat:15, duty:10, clearing:1 },
  "SOYBEAN POWDER 454G":                                     { code:'NB2804',   orig:98,   vat:15, duty:10, clearing:1 },
  "SPIRULINA TABLET (1,000'S)":                              { code:'NB2808',   orig:360,  vat:15, duty:0,  clearing:1 },
  "SPIRULINA TABLET (100'S)":                                { code:'NB2806',   orig:68,   vat:15, duty:0,  clearing:1 },
  "SPIRULINA TABLET (300'S)":                                { code:'NB2807',   orig:150,  vat:15, duty:0,  clearing:1 },
  "TEA TREE OIL FEMININE WASH (250ML)":                      { code:'NB7835',   orig:100,  vat:15, duty:20, clearing:1 },
  "TEA TREE OIL LOTION (250ML)":                             { code:'NB7813',   orig:96,   vat:15, duty:20, clearing:1 },
  "TEA TREE OIL TOOTHPASTE (175G)":                          { code:'NB7837',   orig:60,   vat:15, duty:20, clearing:1 },
  "TONGKAT ALI CAPSULE 100'S":                               { code:'NB4823',   orig:188,  vat:15, duty:0,  clearing:1 },
  "TONGKAT ALI CAPSULE 30'S":                                { code:'NB4822',   orig:77,   vat:15, duty:0,  clearing:1 },
  "YEEGANO CAPSULE 30'S":                                    { code:'NB1809',   orig:68,   vat:15, duty:0,  clearing:1 },
  "YEEGANO CAPSULE 90'S":                                    { code:'NB1810',   orig:158,  vat:15, duty:0,  clearing:1 },
  "YEEGARLIC CAPSULE 90'S":                                  { code:'NB1811',   orig:135,  vat:15, duty:0,  clearing:1 },
  "YEEGINKGO TABLET (30'S)":                                 { code:'NB4814',   orig:68,   vat:15, duty:0,  clearing:1 },
  "YEEGINKGO TABLETS 90'S":                                  { code:'NB4815',   orig:165,  vat:15, duty:0,  clearing:1 },
  "YEEYANGYEN TABLET 30'S":                                  { code:'NB3808',   orig:74,   vat:15, duty:0,  clearing:1 },
  "YEEYANGYEN TABLET 90'S":                                  { code:'NB3809',   orig:185,  vat:15, duty:0,  clearing:1 },
};

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

    // ── Price change history ──────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS product_price_history (
        id            SERIAL PRIMARY KEY,
        product_id    INTEGER REFERENCES product_prices(id) ON DELETE CASCADE,
        description   TEXT NOT NULL,
        old_dp        NUMERIC(10,2),
        old_cp        NUMERIC(10,2),
        old_cif       NUMERIC(10,2),
        old_bv        NUMERIC(10,2),
        new_dp        NUMERIC(10,2),
        new_cp        NUMERIC(10,2),
        new_cif       NUMERIC(10,2),
        new_bv        NUMERIC(10,2),
        changed_by    TEXT DEFAULT 'system',
        changed_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pph_product_id ON product_price_history (product_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pph_changed_at ON product_price_history (changed_at DESC)`);
    await query(`ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE`);
    await query(`ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied'`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pph_status ON product_price_history (status) WHERE status = 'pending'`);

    // ── One-time normalisation: uppercase all descriptions and remove case-duplicates ──
    // For any group of rows that share the same UPPER(description), keep the most-recently
    // updated one and delete the rest, then rename the survivor to its uppercased form.
    await query(`
      DELETE FROM product_prices
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g')))
                   ORDER BY updated_at DESC NULLS LAST
                 ) AS rn
          FROM product_prices
        ) ranked
        WHERE rn > 1
      )
    `);
    await query(`
      UPDATE product_prices
      SET description = UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g')))
      WHERE description <> UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g')))
    `);

    let inserted = 0, updated = 0;
    for (const p of STATIC_PRICE_LIST) {
      const res = await query(
        `INSERT INTO product_prices (description, dp, cp, cif, bv) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (description) DO UPDATE
           SET dp=EXCLUDED.dp, cp=EXCLUDED.cp, cif=EXCLUDED.cif, bv=EXCLUDED.bv
           WHERE product_prices.updated_by = 'system'`,
        [String(p.description).trim().toUpperCase().replace(/\s+/g,' '), p.dp, p.cp, p.cif, p.bv]
      );
      if (res.rowCount > 0) { if (res.command === 'INSERT') inserted++; else updated++; }
    }
    if (inserted > 0) console.log(`Seeded ${inserted} new products into product_prices`);
    if (updated > 0) console.log(`Corrected prices for ${updated} system-seeded products`);
    for (const pkg of STATIC_PACKAGE_LIST) {
      await query(
        `INSERT INTO product_prices (description, dp, cp, cif, bv, is_package) VALUES ($1,$2,$3,$4,$5,TRUE)
         ON CONFLICT (description) DO UPDATE SET dp=$2, cp=$3, bv=$5, is_package=TRUE`,
        [String(pkg.description).trim().toUpperCase().replace(/\s+/g,' '), pkg.dp, pkg.cp, pkg.cif, pkg.bv]
      );
    }
    console.log(`Ensured ${STATIC_PACKAGE_LIST.length} packages in product_prices`);

    // Seed product codes and CIF breakdown data from official PDF price list
    let cifSeeded = 0;
    for (const [normalizedDesc, d] of Object.entries(CIF_DATA)) {
      const res = await query(
        `UPDATE product_prices
         SET product_code = $1, original_cif = $2, vat_pct = $3, import_duty_pct = $4, clearing_fee = $5
         WHERE UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g'))) = $6
           AND (product_code IS NULL OR product_code <> $1 OR original_cif IS DISTINCT FROM $2 OR vat_pct IS DISTINCT FROM $3 OR import_duty_pct IS DISTINCT FROM $4)`,
        [d.code, d.orig, d.vat, d.duty, d.clearing, normalizedDesc]
      );
      if (res.rowCount > 0) cifSeeded++;
    }
    if (cifSeeded > 0) console.log(`[prices] Seeded CIF data + codes for ${cifSeeded} products`);
  } catch (err) {
    console.error('initProductPricesTable error:', err.message);
  }
}
initProductPricesTable();

// ── PDF text extraction endpoint ──────────────────────────────────────────────
// Accepts a PDF file (multipart/form-data field "pdf") and returns extracted text.
// Runs on the server with pdf-parse so no browser/bundler issues apply.
const _pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/gm/extract-pdf', _pdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: req.file.buffer });
    const result = await parser.getText();
    res.json({ text: result.text });
  } catch (err) {
    console.error('PDF extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Apply any pending price changes whose effective_from date has arrived
async function applyPendingPriceChanges() {
  try {
    const { query } = await import('./api/db.js');
    const { rows: pending } = await query(
      `SELECT * FROM product_price_history WHERE status = 'pending' AND effective_from <= CURRENT_DATE ORDER BY effective_from ASC, id ASC`
    );
    if (!pending.length) return;
    for (const c of pending) {
      await query(
        `UPDATE product_prices SET dp=$1, cp=$2, cif=$3, bv=$4, updated_at=NOW(), updated_by=$5 WHERE id=$6`,
        [c.new_dp, c.new_cp, c.new_cif, c.new_bv, c.changed_by, c.product_id]
      );
      await query(`UPDATE product_price_history SET status='applied' WHERE id=$1`, [c.id]);
    }
    console.log(`[prices] Applied ${pending.length} scheduled price change(s)`);
  } catch (err) {
    console.error('[prices] applyPendingPriceChanges error:', err.message);
  }
}
// Run once at startup and then every hour
setInterval(applyPendingPriceChanges, 60 * 60 * 1000);

app.get('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    // DISTINCT ON normalised description to eliminate near-duplicates (spacing/case variants)
    const { rows } = await query(`
      SELECT DISTINCT ON (UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g'))))
        *
      FROM product_prices
      ORDER BY UPPER(TRIM(REGEXP_REPLACE(description, '\\s+', ' ', 'g'))), updated_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    // Accept both legacy array body and new {updates, effective_from} body
    const updates = Array.isArray(req.body) ? req.body : (req.body?.updates || []);
    const effectiveFrom = Array.isArray(req.body) ? null : (req.body?.effective_from || null);
    if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'Expected array of price updates' });
    const today = new Date().toISOString().slice(0, 10);
    const isImmediate = !effectiveFrom || effectiveFrom <= today;
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    let count = 0;
    for (const u of updates) {
      if (!u.id) continue;
      const { rows: old } = await query(`SELECT dp, cp, cif, bv, description FROM product_prices WHERE id=$1`, [u.id]);
      if (!old.length) continue;
      const o = old[0];
      const newDp = Number(u.dp)||0, newCp = Number(u.cp)||0, newCif = Number(u.cif)||0, newBv = Number(u.bv)||0;
      const changed = o.dp != newDp || o.cp != newCp || o.cif != newCif || o.bv != newBv;
      if (changed) {
        await query(
          `INSERT INTO product_price_history (product_id, description, old_dp, old_cp, old_cif, old_bv, new_dp, new_cp, new_cif, new_bv, changed_by, effective_from, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [u.id, o.description, o.dp, o.cp, o.cif, o.bv, newDp, newCp, newCif, newBv, updatedBy, effectiveFrom || today, isImmediate ? 'applied' : 'pending']
        );
      }
      if (isImmediate) {
        // Build dynamic SET for price + any CIF breakdown fields included in update
        const setClauses = ['dp=$1','cp=$2','cif=$3','bv=$4','updated_at=NOW()','updated_by=$5'];
        const setVals = [newDp, newCp, newCif, newBv, updatedBy];
        let sIdx = 6;
        if (u.product_code !== undefined) { setClauses.push(`product_code=$${sIdx++}`); setVals.push(u.product_code || null); }
        if (u.original_cif !== undefined) { setClauses.push(`original_cif=$${sIdx++}`); setVals.push(u.original_cif != null ? Number(u.original_cif) : null); }
        if (u.vat_pct !== undefined) { setClauses.push(`vat_pct=$${sIdx++}`); setVals.push(Number(u.vat_pct)||15); }
        if (u.import_duty_pct !== undefined) { setClauses.push(`import_duty_pct=$${sIdx++}`); setVals.push(Number(u.import_duty_pct)||0); }
        if (u.clearing_fee !== undefined) { setClauses.push(`clearing_fee=$${sIdx++}`); setVals.push(Number(u.clearing_fee)||1); }
        setVals.push(u.id);
        await query(`UPDATE product_prices SET ${setClauses.join(',')} WHERE id=$${sIdx}`, setVals);
      }
      count++;
    }
    res.json({ success: true, updated: count, pending: !isImmediate, effective_from: effectiveFrom || today });
  } catch (err) {
    console.error('PUT /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/prices/:id', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { id } = req.params;
    const { dp, cp, cif, bv, description, product_code, original_cif, vat_pct, import_duty_pct, clearing_fee } = req.body;
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    // Snapshot old values before patching
    const { rows: old } = await query(`SELECT dp, cp, cif, bv, description FROM product_prices WHERE id=$1`, [id]);
    const fields = [];
    const vals = [];
    let i = 1;
    if (dp !== undefined) { fields.push(`dp=$${i++}`); vals.push(Number(dp)||0); }
    if (cp !== undefined) { fields.push(`cp=$${i++}`); vals.push(Number(cp)||0); }
    if (cif !== undefined) { fields.push(`cif=$${i++}`); vals.push(Number(cif)||0); }
    if (bv !== undefined) { fields.push(`bv=$${i++}`); vals.push(Number(bv)||0); }
    if (description !== undefined) { fields.push(`description=$${i++}`); vals.push(String(description)); }
    if (product_code !== undefined) { fields.push(`product_code=$${i++}`); vals.push(product_code || null); }
    if (original_cif !== undefined) { fields.push(`original_cif=$${i++}`); vals.push(original_cif != null ? Number(original_cif) : null); }
    if (vat_pct !== undefined) { fields.push(`vat_pct=$${i++}`); vals.push(Number(vat_pct)||15); }
    if (import_duty_pct !== undefined) { fields.push(`import_duty_pct=$${i++}`); vals.push(Number(import_duty_pct)||0); }
    if (clearing_fee !== undefined) { fields.push(`clearing_fee=$${i++}`); vals.push(Number(clearing_fee)||1); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=NOW()`, `updated_by=$${i++}`);
    vals.push(updatedBy, id);
    await query(`UPDATE product_prices SET ${fields.join(',')} WHERE id=$${i}`, vals);
    const { rows } = await query('SELECT * FROM product_prices WHERE id=$1', [id]);
    // Log history if price values changed
    if (old.length && rows.length) {
      const o = old[0], n = rows[0];
      const changed = o.dp != n.dp || o.cp != n.cp || o.cif != n.cif || o.bv != n.bv;
      if (changed) {
        await query(
          `INSERT INTO product_price_history (product_id, description, old_dp, old_cp, old_cif, old_bv, new_dp, new_cp, new_cif, new_bv, changed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, o.description, o.dp, o.cp, o.cif, o.bv, n.dp, n.cp, n.cif, n.bv, updatedBy]
        );
      }
    }
    res.json(rows[0] || { success: true });
  } catch (err) {
    console.error('PATCH /api/prices/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sales analytics per product — last 90 days of branch inventory movements
app.get('/api/prices/analytics', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { rows } = await query(`
      SELECT
        pp.id,
        pp.description,
        pp.product_code,
        pp.dp, pp.cp, pp.cif,
        pp.original_cif, pp.vat_pct, pp.import_duty_pct, pp.clearing_fee,
        pp.bv, pp.is_package,
        COALESCE(SUM(CASE WHEN m.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense','campaign_sale','campaign_free_item')
                          THEN ABS(m.quantity) ELSE 0 END), 0)::NUMERIC(14,2) AS units_sold_90d,
        COALESCE(SUM(CASE WHEN m.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense','campaign_sale')
                          THEN ABS(m.quantity) * COALESCE(m.unit_price, pp.dp, 0) ELSE 0 END), 0)::NUMERIC(14,2) AS revenue_dp_90d,
        COALESCE(SUM(CASE WHEN m.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense','campaign_sale')
                          THEN ABS(m.quantity) * (COALESCE(m.unit_price, pp.dp, 0) - COALESCE(pp.cif, 0)) ELSE 0 END), 0)::NUMERIC(14,2) AS gross_profit_90d,
        COALESCE(COUNT(DISTINCT DATE_TRUNC('month', m.created_at)), 0)::INTEGER AS active_months
      FROM product_prices pp
      LEFT JOIN branch_inventory_movements m
        ON UPPER(TRIM(REGEXP_REPLACE(m.product_name, '\\s+', ' ', 'g'))) = UPPER(TRIM(REGEXP_REPLACE(pp.description, '\\s+', ' ', 'g')))
        AND m.created_at >= NOW() - INTERVAL '90 days'
        AND m.type IN ('walk_in_member_sale','walk_in_non_member_sale','sale','prescription_dispense','campaign_sale','campaign_free_item')
      WHERE pp.is_package IS NOT TRUE
      GROUP BY pp.id
      ORDER BY units_sold_90d DESC, pp.description ASC
    `);
    res.json({ success: true, products: rows });
  } catch (err) {
    console.error('GET /api/prices/analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prices/pending', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { rows } = await query(
      `SELECT h.*, pp.description AS current_description, pp.dp AS live_dp, pp.cp AS live_cp, pp.cif AS live_cif, pp.bv AS live_bv
       FROM product_price_history h
       LEFT JOIN product_prices pp ON pp.id = h.product_id
       WHERE h.status = 'pending'
       ORDER BY h.effective_from ASC, h.id ASC`
    );
    res.json({ success: true, pending: rows });
  } catch (err) {
    console.error('GET /api/prices/pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prices/history', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { product_id, limit = 200 } = req.query;
    const cond = product_id ? `WHERE h.product_id = $1` : '';
    const params = product_id ? [product_id] : [];
    const { rows } = await query(
      `SELECT h.*, pp.description AS current_description
       FROM product_price_history h
       LEFT JOIN product_prices pp ON pp.id = h.product_id
       ${cond}
       ORDER BY h.changed_at DESC
       LIMIT ${Number(limit) || 200}`,
      params
    );
    res.json({ success: true, history: rows });
  } catch (err) {
    console.error('GET /api/prices/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { description, dp, cp, cif, bv } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    // Always store description as UPPERCASE so ON CONFLICT works regardless of source case
    const desc = String(description).trim().toUpperCase().replace(/\s+/g, ' ');
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    const { rows } = await query(
      `INSERT INTO product_prices (description, dp, cp, cif, bv, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (description) DO UPDATE SET dp=$2,cp=$3,cif=$4,bv=$5,updated_by=$6,updated_at=NOW() RETURNING *`,
      [desc, Number(dp)||0, Number(cp)||0, Number(cif)||0, Number(bv)||0, updatedBy]
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

app.get('/api/branch/inventory-movements', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const limit = Math.min(parseInt(req.query.limit || '500'), 2000);
    const from = req.query.from || null;
    const to = req.query.to || null;
    const params = [limit];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}::date`; }
    if (to)   { params.push(to + 'T23:59:59'); dateFilter += ` AND created_at <= $${params.length}::timestamp`; }
    const rows = await getMany(
      `SELECT id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at
       FROM branch_inventory_movements
       WHERE 1=1 ${dateFilter}
       ORDER BY created_at DESC LIMIT $1`,
      params
    );
    const fmt = d => d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
    res.json(rows.map(r => ({ ...r, quantity: Number(r.quantity || 0), created_at: fmt(r.created_at) })));
  } catch (err) {
    console.error('[branch/inventory-movements]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// All active branch inventory batches (branch_inventory_batches) with prices from
// product_prices (GM Price List). Used by the Inventory tab Batch Status section.
app.get('/api/stock/branch-batches', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const rows = await getMany(`
      SELECT b.id, b.branch_id, b.product_name, b.batch_no, b.expiry_date,
             b.quantity, b.status, b.source_warehouse, b.created_at,
             COALESCE(NULLIF(p.dp,  0), NULLIF(b.unit_price, 0), 0) AS dp,
             COALESCE(NULLIF(p.cif, 0), 0)                          AS cif
      FROM   branch_inventory_batches b
      LEFT JOIN product_prices p
             ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
      WHERE  b.quantity > 0
      ORDER  BY b.branch_id, b.product_name, b.expiry_date NULLS LAST
    `);
    res.json(rows.map(r => ({
      ...r,
      quantity:   Number(r.quantity  || 0),
      dp:         Number(r.dp        || 0),
      cif:        Number(r.cif       || 0),
      location:   r.branch_id,
      locationType: 'branch',
      description: r.product_name,
      remaining_quantity: Number(r.quantity || 0),
      dpc_unit_value: Number(r.dp  || 0),
      cif_unit_cost:  Number(r.cif || 0),
    })));
  } catch (err) {
    console.error('[stock/branch-batches]', err);
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

// ── Bonus Periods + Lookup (used by Payment Voucher form) ────────────────────
app.get('/api/finance/bonus-periods', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    if (!['admin', 'finance', 'gm', 'director'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { rows } = await query(
      `SELECT period,
              COUNT(*) AS total,
              SUM(CASE WHEN status != 'paid' THEN 1 ELSE 0 END) AS unpaid_count,
              COALESCE(SUM(amount_earned), 0) AS total_earned,
              COALESCE(SUM(amount_paid), 0) AS total_paid,
              COALESCE(SUM(amount_earned) - SUM(amount_paid), 0) AS outstanding
       FROM distributor_bonuses
       GROUP BY period
       ORDER BY period DESC
       LIMIT 60`
    );
    res.json(rows);
  } catch (err) {
    console.error('bonus-periods GET:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance/bonus-search', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    if (!['admin', 'finance', 'gm', 'director'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { q = '', period = '', status = '' } = req.query;
    if (!q && !period) return res.json([]);
    const params = [];
    const conds = [];
    if (q.trim()) {
      params.push(`%${q.trim()}%`);
      const n = params.length;
      conds.push(`(nb_number ILIKE $${n} OR distributor_name ILIKE $${n})`);
    }
    if (period) { params.push(period); conds.push(`period = $${params.length}`); }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await query(
      `SELECT id, nb_number, distributor_name, period, status,
              amount_earned, amount_paid,
              COALESCE(amount_earned, 0) - COALESCE(amount_paid, 0) AS outstanding
       FROM distributor_bonuses ${where}
       ORDER BY period DESC, distributor_name
       LIMIT 30`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('bonus-search GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Payment Vouchers API ──────────────────────────────────────────────────────
app.get('/api/payment-vouchers', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director', 'mis'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { status, type, from, to, limit: lim } = req.query;
    const params = [];
    const conds = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (type) { params.push(type); conds.push(`payment_type = $${params.length}`); }
    if (from) { params.push(from); conds.push(`payment_date >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`payment_date <= $${params.length}`); }
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    const rows = (await query(
      `SELECT * FROM payment_vouchers${where} ORDER BY created_at DESC LIMIT ${parseInt(lim) || 200}`,
      params
    )).rows;
    res.json(rows);
  } catch (err) {
    console.error('payment-vouchers GET:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment-vouchers', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const role = req.user?.role || '';
    if (!['admin', 'finance'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    const {
      payment_type, payee_name, payee_bank, payee_account, payee_branch_code,
      amount, currency, payment_method, reference_number, narration,
      authorised_by, payment_date, notes, linked_request_id, linked_request_type, status
    } = req.body;
    if (!payment_type || !payee_name || !amount || !payment_method) {
      return res.status(400).json({ error: 'payment_type, payee_name, amount and payment_method are required' });
    }
    const prepared_by = req.user?.full_name || req.user?.username || 'Finance';
    const id = 'PV' + Date.now();
    const countRow = await getOne('SELECT COUNT(*) AS c FROM payment_vouchers');
    const seq = (parseInt(countRow?.c || 0) + 1).toString().padStart(5, '0');
    const year = new Date().getFullYear();
    const voucher_number = `DPI-PV-${year}-${seq}`;
    await query(
      `INSERT INTO payment_vouchers
        (id, voucher_number, payment_type, payee_name, payee_bank, payee_account, payee_branch_code,
         amount, currency, payment_method, reference_number, narration, authorised_by, prepared_by,
         status, linked_request_id, linked_request_type, payment_date, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())`,
      [id, voucher_number, payment_type, payee_name, payee_bank || null, payee_account || null,
       payee_branch_code || null, parseFloat(amount), currency || 'NAD', payment_method,
       reference_number || null, narration || null, authorised_by || null, prepared_by,
       status || 'draft', linked_request_id || null, linked_request_type || null,
       payment_date || null, notes || null]
    );
    const created = await getOne('SELECT * FROM payment_vouchers WHERE id = $1', [id]);
    let bonusReceipt = null;
    if (status === 'paid' && payment_type === 'bonus' && linked_request_id) {
      try {
        const bonus = await getOne(`SELECT * FROM distributor_bonuses WHERE id = $1`, [linked_request_id]);
        if (bonus && bonus.status !== 'paid') {
          const payAmount = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
          if (payAmount > 0.01) {
            const payId = `BPAY-PV-${Date.now()}`;
            const paidDate = payment_date || new Date().toISOString().slice(0, 10);
            await query(
              `INSERT INTO distributor_bonus_payments (id, bonus_id, branch_id, amount, paid_at, recorded_by, notes, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
              [payId, linked_request_id, 'finance', payAmount, paidDate, prepared_by, `Paid via voucher ${voucher_number}`]
            );
            await query(
              `UPDATE distributor_bonuses SET amount_paid=amount_earned, status='paid', paid_by_branch_id='finance', payment_date=$1, updated_at=NOW() WHERE id=$2`,
              [paidDate, linked_request_id]
            );
            bonusReceipt = { payment_id: payId, bonus_id: linked_request_id, amount: payAmount };
          }
        }
      } catch (bErr) { console.warn('Auto bonus payment failed:', bErr.message); }
    }
    res.json({ success: true, voucher: created, bonusReceipt });
  } catch (err) {
    console.error('payment-vouchers POST:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/payment-vouchers/:id', async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const role = req.user?.role || '';
    if (!['admin', 'finance', 'gm'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { id } = req.params;
    const allowed_fields = ['status', 'payment_method', 'reference_number', 'narration', 'authorised_by',
      'payment_date', 'notes', 'payee_bank', 'payee_account', 'payee_branch_code'];
    const updates = [];
    const params = [];
    for (const f of allowed_fields) {
      if (req.body[f] !== undefined) { params.push(req.body[f]); updates.push(`${f} = $${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await query(
      `UPDATE payment_vouchers SET ${updates.join(', ')}, updated_at=NOW() WHERE id = $${params.length}`,
      params
    );
    const updated = await getOne('SELECT * FROM payment_vouchers WHERE id = $1', [id]);
    let bonusReceipt = null;
    if (req.body.status === 'paid' && updated.payment_type === 'bonus' && updated.linked_request_id) {
      try {
        const bonus = await getOne(`SELECT * FROM distributor_bonuses WHERE id = $1`, [updated.linked_request_id]);
        if (bonus && bonus.status !== 'paid') {
          const payAmount = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
          if (payAmount > 0.01) {
            const preparedBy = req.user?.full_name || req.user?.username || 'Finance';
            const payId = `BPAY-PV-${Date.now()}`;
            const paidDate = updated.payment_date || new Date().toISOString().slice(0, 10);
            await query(
              `INSERT INTO distributor_bonus_payments (id, bonus_id, branch_id, amount, paid_at, recorded_by, notes, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
              [payId, updated.linked_request_id, 'finance', payAmount, paidDate, preparedBy, `Paid via voucher ${updated.voucher_number}`]
            );
            await query(
              `UPDATE distributor_bonuses SET amount_paid=amount_earned, status='paid', paid_by_branch_id='finance', payment_date=$1, updated_at=NOW() WHERE id=$2`,
              [paidDate, updated.linked_request_id]
            );
            bonusReceipt = { payment_id: payId, bonus_id: updated.linked_request_id, amount: payAmount };
          }
        }
      } catch (bErr) { console.warn('Auto bonus payment failed (PATCH):', bErr.message); }
    }
    res.json({ success: true, voucher: updated, bonusReceipt });
  } catch (err) {
    console.error('payment-vouchers PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/payment-vouchers/:id', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const role = req.user?.role || '';
    if (!['admin', 'finance'].includes(role)) return res.status(403).json({ error: 'Access denied' });
    await query('DELETE FROM payment_vouchers WHERE id = $1 AND status = $2', [req.params.id, 'draft']);
    res.json({ success: true });
  } catch (err) {
    console.error('payment-vouchers DELETE:', err);
    res.status(500).json({ error: err.message });
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
      'Katima Mulilo': 'katima_mulilo', 'katima mulilo': 'katima_mulilo', 'katima': 'katima_mulilo',
      'Hochlandpark': 'hochland-park', 'hochland_park': 'hochland-park', 'hochlandpark': 'hochland-park',
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

    // ── Ensure canonical branch IDs exist in the branches table ────────────
    // The branches table may have been seeded with short IDs (e.g. 'oshakati',
    // 'katima') but operational tables use the canonical slugs
    // ('oshakati_branch', 'katima_mulilo'). Insert canonical rows so that
    // any JOIN on branches.id = branch_inventory_batches.branch_id succeeds.
    const canonicalBranchRows = [
      { id: 'oshakati_branch', name: 'Oshakati',      region: 'Oshana' },
      { id: 'katima_mulilo',   name: 'Katima Mulilo', region: 'Zambezi' },
    ];
    for (const b of canonicalBranchRows) {
      try {
        await query(
          `INSERT INTO branches (id, name, region, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [b.id, b.name, b.region]
        );
      } catch (e) {
        console.warn(`[canonical branch insert] ${b.id}:`, e.message);
      }
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
      // Distributor profile photo persistence
      `ALTER TABLE distributors ADD COLUMN IF NOT EXISTS photo_url TEXT`,
      `ALTER TABLE distributors ADD COLUMN IF NOT EXISTS photo_filename TEXT`,
      `ALTER TABLE distributors ADD COLUMN IF NOT EXISTS photo_updated_at TEXT`,
      // CAS: finance_cash_requests updated_at column (unblocks Finance PATCH)
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatch_warehouse VARCHAR(100)`,
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(255)`,
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ`,
      `ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ`,
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255)`,
      `ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS rejected_by VARCHAR(255)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_action VARCHAR(50)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS gm_comment TEXT`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS amended_by_gm VARCHAR(255)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS amended_at TIMESTAMPTZ`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS signature_name VARCHAR(255)`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS branch_receipt_note TEXT`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS discrepancy_flag BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(50)`,
      `ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS expiry_date DATE`,
      `ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS quantity_approved NUMERIC(14,2)`,
      `ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(14,2)`,
      `ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS discrepancy_note TEXT`,
      `ALTER TABLE finance_cash_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
      // file_uploads: description and category for training content
      `ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS category VARCHAR(100)`,
      `ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)`,
      // field_program_requests: distributor info and signature fields
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS distributor_id TEXT`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS distributor_name TEXT`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS distributor_code TEXT`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS signature TEXT`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS distributors JSONB DEFAULT '[]'`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ`,
      `ALTER TABLE field_program_requests ADD COLUMN IF NOT EXISTS reconciled_by TEXT`,
      // Write-off disposal tracking: written-off stock stays in a disposal queue
      // until the stock manager physically disposes of it
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS disposal_status VARCHAR(30) DEFAULT NULL`,
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS disposed_by VARCHAR(255) DEFAULT NULL`,
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMPTZ DEFAULT NULL`,
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS write_off_reason VARCHAR(100) DEFAULT NULL`,
      // Offline sync: idempotency keys to prevent duplicate submissions on reconnect
      `ALTER TABLE branch_walkin_sales ADD COLUMN IF NOT EXISTS offline_id VARCHAR(100) DEFAULT NULL`,
      `ALTER TABLE branch_expenses ADD COLUMN IF NOT EXISTS offline_id VARCHAR(100) DEFAULT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_walkin_sales_offline_id ON branch_walkin_sales (offline_id) WHERE offline_id IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_expenses_offline_id ON branch_expenses (offline_id) WHERE offline_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS branch_refund_requests (
        id               VARCHAR(60)   PRIMARY KEY,
        branch_id        VARCHAR(100)  NOT NULL,
        sale_reference   VARCHAR(100),
        product_name     VARCHAR(200)  NOT NULL,
        batch_no         VARCHAR(100),
        quantity         NUMERIC(10,2) NOT NULL,
        unit_price       NUMERIC(10,2) NOT NULL,
        refund_amount    NUMERIC(10,2) NOT NULL,
        reason           TEXT          NOT NULL,
        status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
        requested_by     VARCHAR(150),
        approved_by      VARCHAR(150),
        rejection_reason TEXT,
        movement_id      VARCHAR(100),
        created_at       TIMESTAMPTZ   DEFAULT NOW(),
        processed_at     TIMESTAMPTZ
      )`,
      // charge_unit: what the patient is actually charged per unit (CP for non-members, DP for members)
      // Stored alongside unit_price (always DP / cost basis) so the correction script and reports
      // can distinguish company cost from patient revenue without re-joining product_prices.
      `ALTER TABLE branch_inventory_movements ADD COLUMN IF NOT EXISTS charge_unit NUMERIC(14,4)`,
      // stock_adjustments: GM-approval workflow for stock record corrections
      `CREATE TABLE IF NOT EXISTS stock_adjustments (
        id                VARCHAR(100)  PRIMARY KEY,
        adj_number        VARCHAR(50),
        target_type       VARCHAR(50),
        target_id         VARCHAR(100),
        product_name      VARCHAR(255),
        location          VARCHAR(100),
        field_to_adjust   VARCHAR(100),
        old_value         TEXT,
        new_value         TEXT,
        reason            TEXT,
        requested_by      VARCHAR(255),
        requested_by_name VARCHAR(255),
        status            VARCHAR(20)   DEFAULT 'pending',
        gm_notes          TEXT,
        approved_by       VARCHAR(255),
        approved_by_name  VARCHAR(255),
        approved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ   DEFAULT NOW(),
        updated_at        TIMESTAMPTZ   DEFAULT NOW()
      )`,
      // Legacy column aliases (field_name was the old name before field_to_adjust)
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS adj_number        VARCHAR(50)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS target_type       VARCHAR(50)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS target_id         VARCHAR(100)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS location          VARCHAR(100)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS field_to_adjust   VARCHAR(100)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS requested_by_name VARCHAR(255)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS gm_notes          TEXT`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by       VARCHAR(255)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_by_name  VARCHAR(255)`,
      `ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ`,
      // Back-fill field_to_adjust from old field_name column (safe no-op if column doesn't exist yet)
      `UPDATE stock_adjustments SET field_to_adjust = field_name WHERE field_to_adjust IS NULL AND field_name IS NOT NULL`,
      // Product codes and CIF breakdown columns
      `ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS product_code VARCHAR(30)`,
      `ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS original_cif NUMERIC(10,2)`,
      `ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS vat_pct NUMERIC(5,2) DEFAULT 15`,
      `ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS import_duty_pct NUMERIC(5,2) DEFAULT 0`,
      `ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS clearing_fee NUMERIC(10,2) DEFAULT 1`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_product_code ON product_prices(product_code) WHERE product_code IS NOT NULL`,
      // QR code field on stock_batches (separate from Code128 barcode)
      `ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS qr_code VARCHAR(200)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_batches_qr_code ON stock_batches(qr_code) WHERE qr_code IS NOT NULL`,
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
    // ── Supplier Purchase Orders ──────────────────────────────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
          id SERIAL PRIMARY KEY,
          order_ref VARCHAR(60) NOT NULL UNIQUE,
          product_name VARCHAR(255) NOT NULL,
          quantity_ordered INTEGER NOT NULL,
          days_remaining NUMERIC(10,1),
          daily_rate NUMERIC(10,4),
          priority_label VARCHAR(80),
          location VARCHAR(120),
          notes TEXT,
          status VARCHAR(40) NOT NULL DEFAULT 'draft',
          requested_by VARCHAR(255),
          requested_by_name VARCHAR(255),
          submitted_by VARCHAR(255),
          submitted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_spo_status ON supplier_purchase_orders (status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_spo_product ON supplier_purchase_orders (product_name)`);
    } catch (e) {
      console.warn('[supplier_purchase_orders init]', e.message);
    }
    // ── Payment Vouchers ──────────────────────────────────────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS payment_vouchers (
          id TEXT PRIMARY KEY,
          voucher_number VARCHAR(30) NOT NULL UNIQUE,
          payment_type VARCHAR(60) NOT NULL,
          payee_name VARCHAR(255) NOT NULL,
          payee_bank VARCHAR(255),
          payee_account VARCHAR(120),
          payee_branch_code VARCHAR(60),
          amount NUMERIC(14,2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'NAD',
          payment_method VARCHAR(40) NOT NULL,
          reference_number VARCHAR(120),
          narration TEXT,
          authorised_by VARCHAR(255),
          prepared_by VARCHAR(255) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'draft',
          linked_request_id TEXT,
          linked_request_type VARCHAR(60),
          payment_date DATE,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_pv_type ON payment_vouchers (payment_type)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_pv_status ON payment_vouchers (status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_pv_date ON payment_vouchers (payment_date)`);
    } catch (e) {
      console.warn('[payment_vouchers init]', e.message);
    }
    // ── Distributor Bonus Statements (monthly upload by admin/GM/MIS) ─────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS distributor_statements (
          id TEXT PRIMARY KEY,
          month VARCHAR(7) NOT NULL UNIQUE,
          label VARCHAR(60),
          uploaded_by VARCHAR(120),
          uploaded_at TIMESTAMPTZ DEFAULT NOW(),
          total_sections INTEGER DEFAULT 0,
          sections JSONB DEFAULT '{}'::jsonb,
          summary_index JSONB DEFAULT '{}'::jsonb
        )
      `);
      await query(`CREATE INDEX IF NOT EXISTS idx_dstmt_month ON distributor_statements (month DESC)`);
    } catch (e) {
      console.warn('[distributor_statements init]', e.message);
    }
    // ── System-wide admin settings (key/value store) ──────────────────────
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(120) PRIMARY KEY,
          value TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    } catch (e) {
      console.warn('[system_settings init]', e.message);
    }
    // ── Receipt number counters (guaranteed unique sequential per branch/year) ──
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS receipt_counters (
          branch_id VARCHAR(50) NOT NULL,
          year      SMALLINT    NOT NULL,
          last_seq  INTEGER     NOT NULL DEFAULT 0,
          PRIMARY KEY (branch_id, year)
        )
      `);
    } catch (e) {
      console.warn('[receipt_counters init]', e.message);
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
        'Katima Mulilo': 'katima_mulilo', 'katima': 'katima_mulilo', 'katima_mulilo': 'katima_mulilo',
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
        'Katima Mulilo': 'katima_mulilo', 'katima': 'katima_mulilo', 'katima_mulilo': 'katima_mulilo', 'katima mulilo': 'katima_mulilo',
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

    // ── Reconcile stock_batches.remaining_quantity ───────────────────────────
    // When stock leaves a location via postStockMovement (stockEngine path) but
    // fefoDeductStockBatches was NOT called, stock_batches.remaining_quantity is
    // left too high — the same units appear in both stock_batches and branch
    // inventory (double-counting).  Fix: compute the un-captured outflow
    // (sm_outflow - dispatched_quantity) and subtract it from remaining_quantity.
    try {
      const reconResult = await query(
        `UPDATE stock_batches sb
         SET remaining_quantity   = GREATEST(0, sb.quantity - new_dispatched),
             dispatched_quantity  = new_dispatched,
             updated_at           = NOW()
         FROM (
           SELECT
             sb2.id,
             GREATEST(
               sb2.dispatched_quantity,
               COALESCE((
                 SELECT SUM(sm.quantity)
                 FROM stock_movements sm
                 WHERE sm.status IN ('posted','approved')
                   AND sm.source_location = sb2.location
                   AND LOWER(TRIM(sm.product_name)) = LOWER(TRIM(sb2.description))
                   AND COALESCE(sm.batch_no,'') = COALESCE(sb2.batch_no,'')
                   AND sm.movement_type NOT IN (
                     'reserved','supplier_import_receipt','positive_adjustment',
                     'return_in','received','warehouse_receipt','inward_receipt'
                   )
               ), 0)
             ) AS new_dispatched
           FROM stock_batches sb2
           WHERE sb2.status NOT IN ('depleted','expired')
         ) calc
         WHERE sb.id = calc.id
           AND (
             calc.new_dispatched > sb.dispatched_quantity
             OR GREATEST(0, sb.quantity - calc.new_dispatched) < sb.remaining_quantity
           )`
      );
      if (reconResult && reconResult.rowCount > 0) {
        console.log(`[startup] Reconciled stock_batches.remaining_quantity for ${reconResult.rowCount} row(s)`);
      }
    } catch (reconErr) {
      console.warn('[startup stock_batches reconcile]', reconErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Deduplicate inventory_balances ──────────────────────────────────────
    // Multiple rows for the same (location_type, location_id, product_name,
    // batch_no, expiry_date) can accumulate over time, inflating stock totals.
    // Keep the row with the highest closing_qty; delete the rest.
    try {
      const dedupIB = await query(
        `DELETE FROM inventory_balances ib1
         WHERE EXISTS (
           SELECT 1 FROM inventory_balances ib2
           WHERE ib2.location_type = ib1.location_type
             AND LOWER(TRIM(ib2.location_id))  = LOWER(TRIM(ib1.location_id))
             AND LOWER(TRIM(ib2.product_name)) = LOWER(TRIM(ib1.product_name))
             AND COALESCE(ib2.batch_no,'')     = COALESCE(ib1.batch_no,'')
             AND ib2.expiry_date IS NOT DISTINCT FROM ib1.expiry_date
             AND (ib2.closing_qty > ib1.closing_qty
               OR (ib2.closing_qty = ib1.closing_qty AND ib2.id > ib1.id))
         )`
      );
      if (dedupIB && dedupIB.rowCount > 0) {
        console.log(`[startup] Removed ${dedupIB.rowCount} duplicate inventory_balances row(s)`);
      }
      // Remove stale non-branch rows with negative / zero closing_qty
      // (country_stock and warehouse balances are tracked via stock_batches, not here)
      const cleanNeg = await query(
        `DELETE FROM inventory_balances
         WHERE location_type NOT IN ('branch')
           AND closing_qty <= 0`
      );
      if (cleanNeg && cleanNeg.rowCount > 0) {
        console.log(`[startup] Removed ${cleanNeg.rowCount} negative/zero non-branch inventory_balances row(s)`);
      }
    } catch (dedupErr) {
      console.warn('[startup inventory_balances dedup]', dedupErr.message);
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
           -- Never re-insert stock that has an approved write-off at this branch/product/batch.
           -- Without this guard a stale inventory_balances row (under a different branch_id
           -- slug variant) would resurrect written-off stock on every server restart.
           AND NOT EXISTS (
             SELECT 1 FROM stock_movements sm
             WHERE sm.movement_type = 'write_off'
               AND sm.status        = 'approved'
               AND LOWER(TRIM(sm.product_name)) = LOWER(TRIM(ib.product_name))
               AND COALESCE(sm.batch_no,'')     = COALESCE(ib.batch_no,'')
               AND LOWER(REPLACE(sm.source_location,' ','_')) = ANY(ARRAY[
                     LOWER(REPLACE(ib.location_id,' ','_')),
                     LOWER(REPLACE(ib.location_id,' ','_')) || '_branch',
                     REGEXP_REPLACE(LOWER(REPLACE(ib.location_id,' ','_')),'_branch$','')
                   ])
           )
         ON CONFLICT DO NOTHING`
      );
      if (bfBatch && bfBatch.rowCount > 0) {
        console.log(`branch_inventory_batches backfill: inserted ${bfBatch.rowCount} rows from inventory_balances`);
      }
    } catch (bfErr) {
      console.warn('[branch_inventory_batches backfill]', bfErr.message);
    }

    // ── Deduplicate branch_inventory_batches ─────────────────────────────────
    // Rows with a NULL batch_no can accumulate if the backfill or other code
    // paths insert multiple rows for the same (branch, product, NULL batch).
    // Keep the row with the highest quantity; delete the rest.
    try {
      const dedupBIB = await query(
        `DELETE FROM branch_inventory_batches bib1
         WHERE EXISTS (
           SELECT 1 FROM branch_inventory_batches bib2
           WHERE bib2.branch_id = bib1.branch_id
             AND LOWER(TRIM(bib2.product_name)) = LOWER(TRIM(bib1.product_name))
             AND bib2.batch_no IS NOT DISTINCT FROM bib1.batch_no
             AND bib2.expiry_date IS NOT DISTINCT FROM bib1.expiry_date
             AND (bib2.quantity > bib1.quantity
               OR (bib2.quantity = bib1.quantity AND bib2.id > bib1.id))
         )`
      );
      if (dedupBIB && dedupBIB.rowCount > 0) {
        console.log(`[startup] Removed ${dedupBIB.rowCount} duplicate branch_inventory_batches row(s)`);
      }
    } catch (dedupBIBErr) {
      console.warn('[startup branch_inventory_batches dedup]', dedupBIBErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Backfill stock_batches for write-offs returned to warehouse ──────────
    // Approved write-offs with disposal_status='returned_to_warehouse' wrote their
    // stock credit to warehouse_inventory (a legacy table) but NOT to stock_batches
    // (which is what the warehouse portal display reads from).  Find all such
    // write-offs and ensure a stock_batches row exists for each.
    try {
      // ── One-time bulk migration: mark all previously-credited write-off returns ─
      // Earlier versions of this backfill loop lacked a persistent marker, so they
      // re-credited stock_batches on every server restart (inflating warehouse quantities
      // or re-inserting cleared country_stock rows).  Stamp them all as processed now
      // so the SELECT below returns 0 rows for historical items.  Any new
      // returned_to_warehouse records created after this run will be marked in the
      // per-item loop below immediately after crediting.
      const bulkMark = await query(
        `UPDATE stock_movements
         SET disposal_status = 'warehouse_stock_credited'
         WHERE movement_type = 'write_off'
           AND status = 'approved'
           AND disposal_status = 'returned_to_warehouse'`
      ).catch(() => null);
      if (bulkMark && bulkMark.rowCount > 0) {
        console.log(`[write-off backfill] Marked ${bulkMark.rowCount} historical returned write-offs as warehouse_stock_credited (one-time migration)`);
      }

      const woReturns = await query(
        `SELECT sm.id, sm.product_name, sm.batch_no, sm.expiry_date, sm.quantity,
                sm.unit_cif, sm.unit_dp, sm.source_location, sm.reference_id,
                wim.warehouse_id AS returned_warehouse_id
         FROM stock_movements sm
         LEFT JOIN warehouse_inventory_movements wim
               ON wim.reference = sm.reference_id
              AND wim.movement_type = 'write_off_return'
         WHERE sm.movement_type = 'write_off'
           AND sm.status = 'approved'
           AND sm.disposal_status = 'returned_to_warehouse'`
      );
      let woBackfilled = 0;
      for (const wo of (woReturns?.rows || [])) {
        try {
          const warehouseId = wo.returned_warehouse_id || (() => {
            // Fallback: infer warehouse from branch name
            const br = (wo.source_location || '').toLowerCase();
            if (br.includes('ondangwa')) return 'ondangwa_warehouse';
            return 'windhoek_warehouse';
          })();
          const qty = Number(wo.quantity || 0);
          if (qty <= 0) {
            // Mark zero-quantity movements as processed so they are never re-queried
            await query(
              `UPDATE stock_movements SET disposal_status = 'warehouse_stock_credited' WHERE id = $1`,
              [wo.id]
            ).catch(() => {});
            continue;
          }
          const batchNo = wo.batch_no || '';

          // Try to increment an existing batch first
          const sbUpd = await query(
            `UPDATE stock_batches
             SET remaining_quantity = remaining_quantity + $1,
                 quantity = quantity + $1,
                 updated_at = NOW()
             WHERE location = $2
               AND LOWER(description) = LOWER($3)
               AND LOWER(COALESCE(batch_no,'')) = LOWER($4)`,
            [qty, warehouseId, wo.product_name, batchNo]
          );
          if (sbUpd && sbUpd.rowCount > 0) {
            woBackfilled++;
          } else {
            // No existing row — create a new stock_batches entry
            const sbId = `SB-WO-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
            const cif = Number(wo.unit_cif || 0);
            const dpc = Number(wo.unit_dp || 0);
            await query(
              `INSERT INTO stock_batches
                 (id, description, batch_no, expiry_date, quantity, remaining_quantity,
                  location, status, cif_unit_cost, dpc_unit_value,
                  cif_total_value, dpc_total_value, created_at, updated_at)
               VALUES ($1,$2,$3,$4::date,$5,$5,$6,'available',$7,$8,$9,$10,NOW(),NOW())
               ON CONFLICT DO NOTHING`,
              [sbId, wo.product_name, batchNo || null, wo.expiry_date || null, qty,
               warehouseId, cif, dpc, qty * cif, qty * dpc]
            );
            woBackfilled++;
          }
          // Mark this movement as fully processed — prevents re-crediting on every subsequent restart.
          // The backfill query's WHERE clause filters on disposal_status = 'returned_to_warehouse',
          // so setting it to 'warehouse_stock_credited' here makes this operation idempotent.
          await query(
            `UPDATE stock_movements SET disposal_status = 'warehouse_stock_credited' WHERE id = $1`,
            [wo.id]
          ).catch(() => {});
        } catch (_) {}
      }
      if (woBackfilled > 0) {
        console.log(`[write-off backfill] Credited ${woBackfilled} returned-to-warehouse item(s) into stock_batches`);
      }
    } catch (woErr) {
      console.warn('[write-off backfill]', woErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────

    // ── One-time idempotent data correction: Eenhana May 5 2026 Rx ──────────
    // The original dispense stored CP in BAT.product_total_dp, BIM.unit_price,
    // and stock_movements.unit_dp instead of DP. These idempotent UPDATEs
    // self-correct only if the wrong value is still present. Each table is in
    // its own try/catch so one failure cannot block the others.
    try {
      // 1. BAT: fix product_total_dp (1925 CP → 1576 DP) and product_total_cp (0 → 1925)
      await query(`
        UPDATE branch_activity_transactions
        SET product_total_dp = 1576.00,
            product_total_cp = 1925.00,
            updated_at = NOW()
        WHERE form_reference_id = 'RPT-1777979570868-b7m93z'
          AND branch_id = 'eenhana'
          AND activity_type = 'prescription_dispensing'
          AND product_total_dp = 1925.00
      `);
      console.log('[data-correction] BAT fix applied (Eenhana Rx product_total_dp).');
    } catch (e) { console.warn('[data-correction] BAT fix error:', e.message); }

    try {
      // 2. BIM: fix unit_price per product (CP → DP) — no updated_at column in this table
      const bimFixes = [
        { product: 'HERBA WARISAN MAHARANI 6 x 10g',             cp: 620, dp: 520 },
        { product: "GINSENG CAPSULE 9 x 10's",                   cp: 655, dp: 546 },
        { product: 'Nano Home Feminine Wash Kacip Fatimah 60ml', cp: 150, dp: 90  },
        { product: "YEEGINKGO TABLETS 90's",                     cp: 500, dp: 420 },
      ];
      for (const fix of bimFixes) {
        await query(`
          UPDATE branch_inventory_movements
          SET unit_price = $1
          WHERE branch_id = 'eenhana'
            AND type = 'prescription_dispense'
            AND reference = 'RPT-1777979570868-b7m93z'
            AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
            AND unit_price = $3
        `, [fix.dp, fix.product, fix.cp]);
      }
      console.log('[data-correction] BIM fix applied (Eenhana Rx unit_price).');
    } catch (e) { console.warn('[data-correction] BIM fix error:', e.message); }

    try {
      // 3. stock_movements: fix unit_dp per product for this prescription
      const smFixes = [
        { product: 'HERBA WARISAN MAHARANI 6 x 10g',             cp: 620, dp: 520 },
        { product: "GINSENG CAPSULE 9 x 10's",                   cp: 655, dp: 546 },
        { product: 'Nano Home Feminine Wash Kacip Fatimah 60ml', cp: 150, dp: 90  },
        { product: "YEEGINKGO TABLETS 90's",                     cp: 500, dp: 420 },
      ];
      for (const fix of smFixes) {
        await query(`
          UPDATE stock_movements
          SET unit_dp = $1, updated_at = NOW()
          WHERE reference_id = 'RPT-1777979570868-b7m93z'
            AND movement_type = 'prescription_dispense'
            AND source_location = 'eenhana'
            AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
            AND unit_dp = $3
        `, [fix.dp, fix.product, fix.cp]);
      }
      console.log('[data-correction] SM fix applied (Eenhana Rx unit_dp).');
    } catch (e) { console.warn('[data-correction] SM fix error:', e.message); }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Retroactive fix: prescription_dispensing BAT rows with grand_total = 0 ─
    // When dispense.js couldn't match a product name in product_prices AND the
    // frontend hadn't yet been updated to pass explicit dp/cp fields, both
    // grand_total and product_total_dp were stored as 0 in BAT and unit_price
    // as null/0 in BIM. This idempotent correction re-derives DP/CP values from
    // product_prices by LOWER(TRIM()) name matching and updates all affected rows.
    try {
      // Step 1: fix BIM unit_price where it is 0 by joining with product_prices
      // PostgreSQL UPDATE-FROM: additional tables listed in FROM, connected via WHERE
      await query(`
        UPDATE branch_inventory_movements
        SET unit_price = pp.dp
        FROM product_prices pp, branch_activity_transactions bat
        WHERE branch_inventory_movements.reference = bat.form_reference_id
          AND branch_inventory_movements.type = 'prescription_dispense'
          AND (branch_inventory_movements.unit_price IS NULL OR branch_inventory_movements.unit_price = 0)
          AND bat.activity_type = 'prescription_dispensing'
          AND bat.workflow_source = 'branch_portal'
          AND (bat.grand_total IS NULL OR bat.grand_total = 0)
          AND LOWER(TRIM(pp.description)) = LOWER(TRIM(branch_inventory_movements.product_name))
          AND pp.dp IS NOT NULL AND pp.dp > 0
      `);

      // Step 2: fix BAT grand_total / product_total_dp by summing corrected BIM rows
      await query(`
        UPDATE branch_activity_transactions bat
        SET product_total_dp = sub.total_dp,
            product_total_cp = sub.total_cp,
            grand_total      = CASE WHEN bat.client_type = 'member' THEN sub.total_dp
                                    ELSE sub.total_cp END,
            updated_at = NOW()
        FROM (
          SELECT
            bim.reference                                              AS report_id,
            bim.branch_id,
            SUM(ABS(bim.quantity) * COALESCE(pp.dp, 0))::numeric      AS total_dp,
            SUM(ABS(bim.quantity) * COALESCE(pp.cp, 0))::numeric      AS total_cp
          FROM branch_inventory_movements bim
          JOIN product_prices pp
            ON LOWER(TRIM(pp.description)) = LOWER(TRIM(bim.product_name))
          WHERE bim.type = 'prescription_dispense'
            AND pp.dp IS NOT NULL AND pp.dp > 0
          GROUP BY bim.reference, bim.branch_id
        ) sub
        WHERE bat.form_reference_id = sub.report_id
          AND bat.branch_id        = sub.branch_id
          AND bat.activity_type    = 'prescription_dispensing'
          AND bat.workflow_source  = 'branch_portal'
          AND (bat.grand_total IS NULL OR bat.grand_total = 0)
          AND sub.total_dp > 0
      `);

      // Step 3: fix stock_movements unit_dp = 0 for prescription_dispense rows
      await query(`
        UPDATE stock_movements sm
        SET unit_dp = pp.dp, updated_at = NOW()
        FROM product_prices pp
        WHERE sm.movement_type = 'prescription_dispense'
          AND LOWER(TRIM(pp.description)) = LOWER(TRIM(sm.product_name))
          AND (sm.unit_dp IS NULL OR sm.unit_dp = 0)
          AND pp.dp IS NOT NULL AND pp.dp > 0
      `);

      console.log('[data-correction] Prescription Rx zero-price rows corrected across all branches.');
    } catch (rxFixErr) {
      console.warn('[data-correction] Rx zero-price fix error:', rxFixErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

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
      // Finance, GM & Stock portal access accounts — admin must change these passwords immediately after first login
      { id: 'USR_FINANCE_001', username: 'finance', password: 'Finance@2025', fullName: 'Finance Officer', email: 'finance@dynapharm.com.na', phone: '', role: 'finance', branch: 'townshop', mustChangePassword: true },
      { id: 'USR_GM_001', username: 'gm', password: 'GM@2025', fullName: 'General Manager', email: 'gm@dynapharm.com.na', phone: '', role: 'gm', branch: 'townshop', mustChangePassword: true },
      { id: 'USR_STOCK_001', username: 'stock', password: 'Stock@2025', fullName: 'Stock Manager', email: 'stock@dynapharm.com.na', phone: '', role: 'stock', branch: 'all', mustChangePassword: false },
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
    // Apply any pending price changes now that schema is fully up to date
    await applyPendingPriceChanges();
  } catch (error) {
    console.warn('Database startup check failed:', error.message);
  }
})();
