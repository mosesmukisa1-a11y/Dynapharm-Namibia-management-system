import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./api/services/queryDescriptors.js";import './api/services/runtimeDiagnostics.js';
import express from 'express';
import { errorOutputBoundary } from './api/services/errorOutputBoundary.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { atomicStockRequest } from './api/_lib/atomicStockRequest.js';
import { createStartupPolicy, runStartupOperation } from './api/services/startupPolicy.js';
import { checkStartupCompatibility, readinessFor, setStartupReadiness,
startupReadinessGate } from './api/services/startupSchema.js';

const startupPolicy = createStartupPolicy(process.env);
setStartupReadiness(readinessFor(startupPolicy));
console.info(JSON.stringify({ event: 'startup.policy', ...startupPolicy }));

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const HOST = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEPLOY_VERSION = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const VERSION_FILE = path.join(__dirname, 'version.json');
runStartupOperation(startupPolicy, 'runtime-version-file', () => {try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: DEPLOY_VERSION, deployedAt: new Date().toISOString() }), 'utf8');
  } catch (e) {
    console.warn('Could not write version.json:', e.message);
  }});

const UPLOADS_DIR = path.join(__dirname, 'uploads');
runStartupOperation(startupPolicy, 'uploads-directory', () => {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
});

const app = express();
app.use(errorOutputBoundary);
app.use(startupReadinessGate);

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
  }
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
runStartupOperation(startupPolicy, 'video-cache-cleanup-timer', () => setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _videoTmpCache) {
    if (now - val.ts > VIDEO_CACHE_TTL) {
      _videoTmpCache.delete(key);
      fs.unlink(val.tmpPath, () => {});
    }
  }
}, 15 * 60 * 1000));

app.get('/api/obj/*', async (req, res) => {
  try {
    const objectName = req.path.replace(/^\/api\/obj\//, '');
    // Clinical attachments are served only by the scoped authenticated endpoint.
    if (decodeURIComponent(objectName).includes('client-history-private'))
    return res.status(404).json({ error: 'File not found' });
    const client = await getStorageClient();
    if (!objectName) return res.status(400).json({ error: 'No object path specified' });

    const ext = path.extname(objectName).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/mp4',
      '.ogg': 'video/ogg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
'/api/version'];


function isPublicRoute(routePath) {
  return PUBLIC_ROUTE_PREFIXES.some((prefix) =>
  routePath === prefix ||
  routePath.startsWith(prefix.endsWith('/') ? prefix : prefix + '/') ||
  routePath.startsWith(prefix + '?')
  );
}

app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const routePath = req.baseUrl + req.path.replace(/\/$/, '');
  const isPublic = isPublicRoute(routePath);
  const { isFreshCredentialLogin } = await import('./api/services/sessionPolicy.js');
  if (isFreshCredentialLogin(req.method, routePath)) return next();

  try {
    const { getTokenFromRequest, verifyAuthToken } = await import('./api/_lib/auth.js');
    const token = getTokenFromRequest(req);
    const decoded = verifyAuthToken(token);
    if (decoded && decoded.sub) {
      const { resolveSession } = await import('./api/services/credentialSecurity.js');
      req.user = await resolveSession(decoded);
      if (!req.user) return res.status(401).json({ error: 'Session expired. Sign in again.' });
      if (req.user.mustChangePassword && ![
      '/api/auth/credential-security', '/api/auth/me', '/api/auth/logout'].
      includes(routePath))
      return res.status(403).json({ error: 'Change your temporary password before continuing.',
        code: 'PASSWORD_CHANGE_REQUIRED' });
    } else if (!isPublic) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
  } catch (err) {
    if (!isPublic) {
      console.error('Auth middleware validation failed');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
  }
  next();
});

// Retired legacy client contained local credential handling. Keep bookmarked URLs
// usable, but serve the supported server-authenticated React application instead.
app.get(['/dynapharm-complete-system', '/dynapharm-complete-system.html'],
(req, res) => res.redirect('/'));
// Apply due prices before any API handler can use the current catalogue.
let priceActivationDay = null,priceActivationFlight = null;
app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  // A health/read-only request must not activate scheduled prices in code-only.
  if (!startupPolicy.writesAllowed) return next();
  try {
    const { businessToday } = await import('./shared/price-list-import.js');
    const day = businessToday();
    if (priceActivationDay !== day) {
      if (!priceActivationFlight) priceActivationFlight = (async () => {
        const { activateDuePrices } = await import('./api/services/priceImport.js');
        await activateDuePrices();priceActivationDay = day;
      })().finally(() => {priceActivationFlight = null;});
      await priceActivationFlight;
    }
    next();
  } catch (error) {res.status(503).json({ error: 'Live prices could not be refreshed. Please retry.' });}
});
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
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:374:0"),








    [username]);

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
    await __qd_executePlan(query, __qd_registeredPlan("server.js:401:1"),


    [username, staffName, type, startDate, endDate, reason, !!urgent, username]);

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
    let sql = __qd_registeredPlan("server.js:420:2");




















    const params = [];
    const conds = [];
    if (status) {params.push(status);conds.push(__qd_registeredPlan("server.js:443:4", [params.length]));}
    if (conds.length) sql = __qd_joinPlans([sql, __qd_joinPlans([__qd_registeredPlan("server.js:444:3"), __qd_joinPlans(conds, "and")], "empty")], "empty");
    sql = __qd_joinPlans([sql, __qd_registeredPlan("server.js:445:5")], "empty");
    const { rows } = await __qd_executePlan(query, sql, params);
    res.json(rows);
  } catch (err) {
    console.error('leave-requests/admin GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin/GM/Finance: approve or reject a leave request
app.patch('/api/leave-requests/:id', atomicStockRequest(async (req, res) => {
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
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:466:6"), [id]);
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status === status) return res.json({ success: true, status });
    if (existing.status !== 'pending') return res.status(409).json({ error: 'Leave request is already reviewed' });
    const actorName = req.user?.sub || req.user?.id || req.user?.username;
    await __qd_executePlan(query, __qd_registeredPlan("server.js:472:7"),

    [status, actorName, note || null, id]);

    res.json({ success: true, status });
  } catch (err) {
    console.error('leave-requests PATCH:', err);
    res.status(500).json({ error: err.message });
  }
}));

app.get('/api/cash-requests', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const username = (req.user?.sub || req.user?.username || '').toLowerCase();
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:487:8"),










    [username]);

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
    await __qd_executePlan(query, __qd_registeredPlan("server.js:518:9"),


    [
    'CAS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    reqNum,
    branchName,
    parseFloat(amount),
    purpose,
    username,
    JSON.stringify({ submittedByName: staffName, expenseCategory: expenseCategory || 'General', neededBy: neededBy || null })]);


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
    let sql = __qd_registeredPlan("server.js:546:10");











    const params = [];
    const conds = [];
    if (status) {params.push(status);conds.push(__qd_registeredPlan("server.js:560:12", [params.length]));}
    if (branch) {params.push(branch);conds.push(__qd_registeredPlan("server.js:561:13", [params.length]));}
    if (conds.length) sql = __qd_joinPlans([sql, __qd_joinPlans([__qd_registeredPlan("server.js:562:11"), __qd_joinPlans(conds, "and")], "empty")], "empty");
    sql = __qd_joinPlans([sql, __qd_registeredPlan("server.js:563:14")], "empty");
    const { rows } = await __qd_executePlan(query, sql, params);
    res.json(rows);
  } catch (err) {
    console.error('cash-requests/admin GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Finance marks as reviewed; GM approves/rejects
app.patch('/api/cash-requests/:id', atomicStockRequest(async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const role = req.user?.role || '';
    const allowed = ['admin', 'finance', 'gm', 'director'];
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Access denied' });
    const { id } = req.params;
    const { status, note } = req.body;
    if (!['finance_reviewed', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid review status' });
    if (['approved', 'rejected'].includes(status) && role === 'finance') return res.status(403).json({ error: 'GM approval access required' });
    if (status === 'finance_reviewed' && !['finance', 'admin'].includes(role)) return res.status(403).json({ error: 'Finance review access required' });
    const actorName = req.user?.sub || req.user?.id || req.user?.username;
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:585:15"), [id]);
    if (!existing) return res.status(404).json({ error: 'Request not found' });
    if (existing.status === status) return res.json({ success: true, status });
    if (!['pending', 'finance_reviewed'].includes(existing.status)) return res.status(409).json({ error: 'Cash request is already reviewed' });
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
    await __qd_executePlan(query, __qd_registeredPlan("server.js:606:16"),

    [status, JSON.stringify(dataUpdates), id]);

    res.json({ success: true, status });
  } catch (err) {
    console.error('cash-requests PATCH:', err);
    res.status(500).json({ error: err.message });
  }
}));

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
      let sql = __qd_registeredPlan("server.js:626:17");
      const params = [];
      if (department) {params.push(department);sql = __qd_joinPlans([sql, __qd_registeredPlan("server.js:628:18")], "empty");}
      sql = __qd_joinPlans([sql, __qd_registeredPlan("server.js:629:19")], "empty");
      ({ rows } = await __qd_executePlan(query, sql, params));
    } else {
      ({ rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:633:20"),

      [username]));

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
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:653:21"),


    [username, department, category, Number(amount), description, date || new Date().toISOString().slice(0, 10), receipt_ref || null]);

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
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:675:22"),

    [status, actorName, notes || null, id]);

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
    if (status) {params.push(status);conds.push(__qd_registeredPlan("server.js:693:24", [params.length]));}
    if (target_id) {params.push(target_id);conds.push(__qd_registeredPlan("server.js:694:25", [params.length]));}
    const whereClause = conds.length ? __qd_joinPlans([__qd_registeredPlan("server.js:695:23"), __qd_joinPlans(conds, "and")], "empty") : __qd_registeredPlan("server.js:695:26");
    const sql = __qd_registeredPlan("server.js:696:27", [






    whereClause]);

    const { rows } = await __qd_executePlan(query, sql, params);
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
    await __qd_executePlan(query, __qd_registeredPlan("server.js:725:28"),


    [id, adj_number, target_type, target_id || null, product_name || null, location || null, field_to_adjust, old_value || null, new_value, reason, requested_by, requested_by_name]);

    res.status(201).json({ success: true, id, adj_number });
  } catch (err) {
    console.error('stock-adjustments POST:', err);
    res.status(500).json({ error: err.message });
  }
});

const approveStockAdjustment = atomicStockRequest(async (req, res) => {
  try {
    const { query, getOne } = await import('./api/db.js');
    const { recomputeLocationBalances } = await import('./api/services/stockEngine.js');
    const adjId = req.params.id;
    const gm_notes = req.body?.gm_notes || '';

    // E: Role guard — only GM, admin, or superadmin may approve stock edits.
    const callerRole = (req.user?.role || '').toLowerCase();
    if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'GM or admin access required to approve stock adjustments' });
    }

    const approved_by = req.user?.sub || req.user?.username || 'gm';
    const approved_by_name = req.user?.fullName || req.user?.full_name || req.user?.name || approved_by;

    const adj = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:752:29"), [adjId]);
    if (!adj) return res.status(404).json({ error: 'Adjustment not found' });
    if (adj.status === 'approved') return res.json({ success: true, message: 'Adjustment already approved' });
    if (adj.status !== 'pending') return res.status(409).json({ error: 'Already processed' });

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
      notes: 'notes'
    };

    // Helper: map target_type → location_type string used by stockEngine
    const toLocType = (tt) => {
      if (tt === 'warehouse') return 'warehouse';
      if (tt === 'import' || tt === 'country_stock') return 'country';
      if (tt === 'branch') return 'branch';
      return tt;
    };

    let recomputeNeeded = null; // { locType, location }

    if (target_id && field_to_adjust) {
      if (['import', 'country_stock', 'warehouse', 'branch'].includes(target_type)) {
        const dbCol = Object.hasOwn(batchColumnMap, field_to_adjust) ? batchColumnMap[field_to_adjust] : null;
        if (!dbCol) return res.status(400).json({ error: `Field '${field_to_adjust}' is not adjustable` });

        // Fetch current batch for audit trail (batch_no, expiry_date, location)
        const batchRow = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:788:30"), [target_id]);
        if (!batchRow) return res.status(404).json({ error: 'Target stock batch not found; approval was not applied.' });
        const qtyDelta = field_to_adjust === 'quantity' ? Number(new_value) - Number(batchRow.remaining_quantity || 0) : 0;
        if (field_to_adjust === 'quantity' && (!Number.isFinite(Number(new_value)) || Number(new_value) < 0 || !Number.isInteger(Number(new_value)))) return res.status(400).json({ error: 'Quantity must be a nonnegative whole base-unit quantity.' });

        if (field_to_adjust === 'quantity') {
          // Update both remaining_quantity AND quantity (by the same delta) so the
          // invariant  remaining = quantity - dispatched_quantity  always holds.
          // Without bumping quantity, the startup reconciliation detects
          // remaining > (quantity - dispatched) and reverts the approved edit on
          // every server restart.  'positive_adjustment'/'negative_adjustment' are
          // already in the reconciliation exclusion list, so the audit movement
          // won't re-trigger it.
          await __qd_executePlan(query, __qd_registeredPlan("server.js:802:31"),





          [Number(new_value), qtyDelta, target_id]);


          // B/C: Only insert a movement for quantity changes (not for metadata edits).
          // F: Use positive_adjustment vs negative_adjustment based on delta direction.
          // C: Include status='posted', location_type, batch_no, expiry_date.
          const movType = qtyDelta >= 0 ? 'positive_adjustment' : 'negative_adjustment';
          const movQty = Math.abs(qtyDelta);
          const batchLoc = batchRow?.location || adj.location || target_type;
          const batchLocType = toLocType(target_type);
          const movId = 'MOV-ADJ-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
          if (qtyDelta !== 0) {
            try {
              await __qd_executePlan(query, __qd_registeredPlan("server.js:821:32"),






              [movId, adj.product_name || 'Unknown',
              batchRow?.batch_no || null, batchRow?.expiry_date || null,
              movQty, movType,
              batchLoc, batchLocType,
              adjId,
              `Approved correction: ${field_to_adjust} changed from ${adj.old_value} to ${new_value}. Ref: ${adj.adj_number}`,
              approved_by]);

            } catch (movErr) {
              console.warn('stock_movements insert skipped:', movErr.message);
            }
          }
        } else {
          await __qd_executePlan(query, __qd_registeredPlan("server.js:840:33", [dbCol]), [new_value, target_id]);
          // B: No movement for non-quantity field changes (expiry_date, batch_no, unit_price, notes).
          // These are metadata corrections and don't represent stock flow.
        }

        // A: Recompute inventory_balances cache after any stock_batches change.
        const batchLoc = batchRow?.location || adj.location || target_type;
        recomputeNeeded = { locType: toLocType(target_type), location: batchLoc };

      } else if (target_type === 'distribution') {
        // D: Update stock_transfer_items (the actual transfer line items) — NOT stock_request_items.
        // The linked stock_request_items represent the original request; the transfer items
        // drive what was actually dispatched and received.
        if (field_to_adjust === 'quantity') {
          await __qd_executePlan(query, __qd_registeredPlan("server.js:855:34"),



          [Number(new_value), target_id, adj.product_name || '']);

        } else if (field_to_adjust === 'notes') {
          await __qd_executePlan(query, __qd_registeredPlan("server.js:861:35"), [new_value, target_id]);
        }

        // Log movement for distribution quantity changes only.
        if (field_to_adjust === 'quantity') {
          const qtyDelta = Number(new_value) - Number(adj.old_value || 0);
          const movType = qtyDelta >= 0 ? 'positive_adjustment' : 'negative_adjustment';
          const movId = 'MOV-ADJ-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
          try {
            await __qd_executePlan(query, __qd_registeredPlan("server.js:871:36"),






            [movId, adj.product_name || 'Unknown',
            Math.abs(qtyDelta), movType,
            adj.location || 'distribution',
            adjId,
            `Approved distribution correction: ${field_to_adjust} changed from ${adj.old_value} to ${new_value}. Ref: ${adj.adj_number}`,
            approved_by]);

          } catch (movErr) {
            console.warn('stock_movements insert skipped:', movErr.message);
          }
        }
      }
    }

    await __qd_executePlan(query, __qd_registeredPlan("server.js:892:37"),

    [gm_notes, approved_by, approved_by_name, adjId]);


    // A: Fire-and-forget recompute so inventory_balances reflects the approved change.
    if (recomputeNeeded) {
      recomputeLocationBalances(recomputeNeeded.locType, recomputeNeeded.location).
      catch((e) => console.warn('[stock-adj approve] recompute error:', e.message));
    }

    res.json({ success: true, message: 'Adjustment approved and applied' });
  } catch (err) {
    console.error('stock-adjustments approve:', err);
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/stock-adjustments/:id/approve', approveStockAdjustment);

const rejectStockAdjustment = atomicStockRequest(async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const adjId = req.params.id;
    const gm_notes = req.body?.gm_notes || '';

    // E: Role guard — only GM, admin, or superadmin may reject stock edits.
    const callerRole = (req.user?.role || '').toLowerCase();
    if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'GM or admin access required to reject stock adjustments' });
    }

    const approved_by = req.user?.sub || req.user?.username || 'gm';
    const approved_by_name = req.user?.fullName || req.user?.full_name || req.user?.name || approved_by;
    const adj = await __qd_executePlan(query, __qd_registeredPlan("server.js:924:38"), [adjId]);
    if (!adj.rows.length) return res.status(404).json({ error: 'Adjustment not found' });
    if (adj.rows[0].status === 'rejected') return res.json({ success: true, message: 'Adjustment rejected' });
    if (adj.rows[0].status !== 'pending') return res.status(409).json({ error: 'Adjustment is already reviewed' });
    await __qd_executePlan(query, __qd_registeredPlan("server.js:929:39"),

    [gm_notes, approved_by, approved_by_name, adjId]);

    res.json({ success: true, message: 'Adjustment rejected' });
  } catch (err) {
    console.error('stock-adjustments reject:', err);
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/stock-adjustments/:id/reject', rejectStockAdjustment);

// One confirmed bulk decision is one transaction. Nested decision handlers
// share its connection, locks and deduplicated after-commit balance refreshes.
app.post('/api/stock-adjustments/bulk-decision', atomicStockRequest(async (req, res) => {
  const role = (req.user?.role || '').toLowerCase();
  if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'GM or admin access required to review stock adjustments' });
  }
  const { action, ids } = req.body || {};
  if (!['approve', 'reject'].includes(action) || !Array.isArray(ids) || !ids.length ||
  ids.length > 500 || ids.some((id) => typeof id !== 'string' || !id.trim())) {
    return res.status(400).json({ error: 'Choose approve or reject and between 1 and 500 stock edit request IDs.' });
  }
  // Stable lock order prevents opposing concurrent batches from deadlocking.
  const uniqueIds = [...new Set(ids)].sort();
  const decide = action === 'approve' ? approveStockAdjustment : rejectStockAdjustment;
  for (const id of uniqueIds) {
    let status = 200;
    let result;
    const response = {
      status(code) {status = code;return this;},
      json(body) {result = body;return this;},
      getHeader() {},
      setHeader() {}
    };
    await decide({ ...req, method: 'PATCH', params: { id },
      body: { gm_notes: req.body.gm_notes || `Bulk ${action} by GM` } }, response);
    if (status >= 400 || result?.success !== true) {
      return res.status(status >= 400 ? status : 500).json({
        success: false, failed_id: id, applied: 0,
        error: `No stock edits were ${action === 'approve' ? 'approved' : 'rejected'}. Request ${id}: ${result?.error || 'Decision failed'}`
      });
    }
  }
  res.json({ success: true, action, applied: uniqueIds.length, ids: uniqueIds });
}));
// ── End Stock Adjustment Routes ────────────────────────────────────────────────

// ── Stock Request Status Update (GM Approval) ──────────────────────────────────
app.put('/api/stock-requests/:id', atomicStockRequest(async (req, res) => {
  const { default: handler } = await import('./api/stock-requests.js');
  req.body = { ...req.body, id: req.params.id };
  return handler(req, res);
}));
// ── End Stock Request Update Route ─────────────────────────────────────────────

// ── Product Price Routes ────────────────────────────────────────────────────────
const STATIC_PRICE_LIST = [
{ description: "ARABICA COFFEE MIX W/GOAT'S AND GANO 25gx20's", dp: 260, cp: 320, bv: 43, cif: 110 },
{ description: "BEE POLLEN CAPSULE (30's)", dp: 182, cp: 237, bv: 32, cif: 78 },
{ description: "BEE POLLEN CAPSULE (100's)", dp: 320, cp: 390, bv: 75, cif: 136 },
{ description: "BODY CONTOUR CREAM", dp: 290, cp: 377, bv: 75, cif: 123 },
{ description: "COMPACT POWDER 12g", dp: 190, cp: 247, bv: 55, cif: 81 },
{ description: "D.I GROW (GREEN) (1 LITER)", dp: 300, cp: 400, bv: 38, cif: 128 },
{ description: "D.I GROW (GREEN) (4LITERS)", dp: 800, cp: 1000, bv: 115, cif: 340 },
{ description: "D.I GROW (RED) (1 LITER)", dp: 300, cp: 400, bv: 38, cif: 128 },
{ description: "D.I GROW (RED) (4LITERS)", dp: 650, cp: 800, bv: 115, cif: 276 },
{ description: "D.I GROW BIO-8 1 LTR", dp: 220, cp: 286, bv: 27, cif: 94 },
{ description: "D.I GROW K 1 LTR", dp: 220, cp: 286, bv: 30, cif: 94 },
{ description: "D.I. INSTANT GOAT'S MILK POWDER PREMIX 20's x 21g", dp: 325, cp: 400, bv: 43, cif: 138 },
{ description: "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25g x 20'", dp: 221, cp: 287, bv: 38, cif: 94 },
{ description: "DI LIQUID ALFALFA PLUS GUARANA (500ml)", dp: 430, cp: 530, bv: 75, cif: 183 },
{ description: "DI LIQUID ALFALFAPLUS GUARANA (150ml)", dp: 200, cp: 260, bv: 21, cif: 85 },
{ description: "DI LIQUID CHLOROPHYLL PLUS GUARANA 500ml", dp: 430, cp: 530, bv: 75, cif: 183 },
{ description: "DI NONI 500ml", dp: 350, cp: 455, bv: 110, cif: 149 },
{ description: "DI NONI JUICE 1 L", dp: 750, cp: 950, bv: 175, cif: 319 },
{ description: "DYNA C- 100 TABLET 150's", dp: 140, cp: 182, bv: 32, cif: 60 },
{ description: "DYNA C- 250 TABLET 90's", dp: 140, cp: 182, bv: 27, cif: 60 },
{ description: "DYNA 'S' TABLET 120's", dp: 290, cp: 360, bv: 65, cif: 123 },
{ description: "DYNA SERENOA TABLET 100's", dp: 520, cp: 620, bv: 115, cif: 221 },
{ description: "DYNA SERENOA TABLET 30's", dp: 195, cp: 254, bv: 38, cif: 83 },
{ description: "DYNA TONIC (150ml)", dp: 208, cp: 270, bv: 27, cif: 88 },
{ description: "DYNA TONIC (780ml)", dp: 600, cp: 710, bv: 120, cif: 255 },
{ description: "DYNA TOOTHBRUSH (SET 3 OF 3)", dp: 70, cp: 91, bv: 15, cif: 30 },
{ description: "DYNA-RH CAPSULE 100's", dp: 300, cp: 390, bv: 60, cif: 128 },
{ description: "E-VITA CREAM (50g)", dp: 610, cp: 700, bv: 165, cif: 259 },
{ description: "GANODERMA LOTION 150ML", dp: 182, cp: 237, bv: 38, cif: 77 },
{ description: "GANODERMA SHOWER GEL 150ml(GANODERMA BODY SCRUB)", dp: 220, cp: 285, bv: 38, cif: 94 },
{ description: "GANODERMA SOAP 2 x 100g", dp: 140, cp: 182, bv: 30, cif: 60 },
{ description: "GANODERMA TOOTHPASTE (150g)", dp: 150, cp: 194, bv: 20, cif: 64 },
{ description: "GINALI CAPSULE 100's", dp: 403, cp: 493, bv: 80, cif: 171 },
{ description: "GINALI CAPSULE 30's", dp: 195, cp: 254, bv: 38, cif: 83 },
{ description: "GINSENG CAPSULE 9 x 10's", dp: 546, cp: 655, bv: 115, cif: 232 },
{ description: "GOAT'S MILK SOAP (100g)", dp: 70, cp: 91, bv: 15, cif: 30 },
{ description: "GOAT'S MILK TABLET 150's", dp: 286, cp: 372, bv: 48, cif: 122 },
{ description: "GOAT'S MILK TABLET 75's", dp: 170, cp: 221, bv: 27, cif: 72 },
{ description: "GREEN TEA CAPSULE 30's", dp: 195, cp: 254, bv: 43, cif: 83 },
{ description: "GREEN TEA CAPSULE 60's", dp: 344, cp: 430, bv: 85, cif: 146 },
{ description: "HERBA WARISAN MAHARANI 6 x 10g", dp: 520, cp: 620, bv: 110, cif: 221 },
{ description: "HIGH FIBER NUTRITION FOOD 30'sx25g", dp: 660, cp: 790, bv: 120, cif: 281 },
{ description: "INSTANT CAPPUCCINO W/ GANO 15's x 35g", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT CEREAL 15's x 32g", dp: 325, cp: 423, bv: 48, cif: 138 },
{ description: "INSTANT CEREAL 30's x 32g", dp: 510, cp: 610, bv: 95, cif: 217 },
{ description: "INSTANT CHOC W/ GANO 30's x 30g", dp: 325, cp: 423, bv: 43, cif: 138 },
{ description: "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'sx21g)", dp: 250, cp: 300, bv: 38, cif: 107 },
{ description: "INSTANT COFFEE MIX WITH GANODERMA 4-IN-1(SACHET) (20's x 21g)", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT COFFEE W/ GANO, GREEN TEA 20's x 21g", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT COFFEE W/ GINKGO & GINSENG 20's x 21g", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT COFFEE W/ TONGKAT ALI 20's x 21g", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT COFFEE W/GANO & TONGKAT ALI BLACK 30's x 5g", dp: 276, cp: 359, bv: 59, cif: 117 },
{ description: "INSTANT GINSENG HONEY GINGER 500g", dp: 350, cp: 420, bv: 43, cif: 149 },
{ description: "INSTANT PEGAGA CAFE 25G x 15s", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT PREMIX COFFEE WITH MANGOSTEEN(25'sx15g)", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "INSTANT WHEATGRASS W/ CHLOROPHYLL 20's x 10g", dp: 286, cp: 372, bv: 43, cif: 122 },
{ description: "MILK TEA WITH TONGKAT ALI 21g x 20's", dp: 230, cp: 290, bv: 43, cif: 98 },
{ description: "MILK THISTLE TABLET 120's", dp: 500, cp: 592, bv: 125, cif: 213 },
{ description: "MILK THISTLE TABLET 30's", dp: 195, cp: 254, bv: 32, cif: 83 },
{ description: "MINERAL POT", dp: 1250, cp: 1625, bv: 265, cif: 531 },
{ description: "Nano Home Feminine Wash Antiseptic w/ Sirih 60ml", dp: 100, cp: 130, bv: 11.5, cif: 43 },
{ description: "Nano Home Feminine Wash Kacip Fatimah 60ml", dp: 100, cp: 130, bv: 11.5, cif: 43 },
{ description: "NANO HOME FEMININE WASH with GAMAT 60ml", dp: 100, cp: 130, bv: 11.5, cif: 43 },
{ description: "NANO HOME GAMAT SOAP 100g", dp: 70, cp: 91, bv: 15, cif: 30 },
{ description: "NANO HOME PEGAGA SOAP 100g", dp: 70, cp: 91, bv: 8, cif: 30 },
{ description: "NONI PLUS TEA 30's x 3g", dp: 299, cp: 360, bv: 65, cif: 127 },
{ description: "NUTMEG OINTMENT (2's x 20g)", dp: 180, cp: 234, bv: 19.5, cif: 77 },
{ description: "PRESIDENT'S CHOICE 4 IN 1 AND CHOCOLATE COFFEE 20'", dp: 288, cp: 374, bv: 43, cif: 122 },
{ description: "PRO- LSB TABLET 150's", dp: 455, cp: 573, bv: 100, cif: 193 },
{ description: "PROLINK 20's x 20g", dp: 588, cp: 688, bv: 135, cif: 250 },
{ description: "PROLINK 30's x 20g", dp: 600, cp: 719, bv: 170, cif: 255 },
{ description: "RED COFFEE W/ GINSENG (12's x 25g)", dp: 260, cp: 320, bv: 38, cif: 110 },
{ description: "REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)", dp: 1200, cp: 1200, bv: 150, cif: 510 },
{ description: "REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)", dp: 1200, cp: 1200, bv: 150, cif: 510 },
{ description: "SEA CUCUMBER JELLY (250ml)", dp: 312, cp: 406, bv: 55, cif: 133 },
{ description: "SEA CUCUMBER JELLY (500ml)", dp: 533, cp: 633, bv: 110, cif: 227 },
{ description: "SEA WATER SPIRULINA POWDER 500g", dp: 340, cp: 420, bv: 48, cif: 145 },
{ description: "SOYBEAN POWDER 454g", dp: 260, cp: 338, bv: 38, cif: 110 },
{ description: "SPIRULINA TABLET (1,000's)", dp: 750, cp: 900, bv: 150, cif: 319 },
{ description: "SPIRULINA TABLET (100's)", dp: 208, cp: 270, bv: 27, cif: 88 },
{ description: "SPIRULINA TABLET (300's)", dp: 351, cp: 456, bv: 64, cif: 149 },
{ description: "TEA TREE OIL FEMININE WASH (250ml)", dp: 190, cp: 247, bv: 43, cif: 81 },
{ description: "TEA TREE OIL LOTION (250ml)", dp: 180, cp: 234, bv: 19.5, cif: 77 },
{ description: "TEA TREE OIL TOOTHPASTE (175g)", dp: 150, cp: 194, bv: 20, cif: 64 },
{ description: "TONGKAT ALI CAPSULE 100's", dp: 400, cp: 490, bv: 80, cif: 170 },
{ description: "TONGKAT ALI CAPSULE 30's", dp: 195, cp: 254, bv: 32, cif: 83 },
{ description: "YEEGANO CAPSULE 30's", dp: 195, cp: 254, bv: 27, cif: 83 },
{ description: "YEEGANO CAPSULE 90's", dp: 364, cp: 454, bv: 75, cif: 155 },
{ description: "YEEGARLIC CAPSULE 90's", dp: 300, cp: 390, bv: 64, cif: 128 },
{ description: "YEEGINKGO TABLET (30's)", dp: 234, cp: 304, bv: 27, cif: 99 },
{ description: "YEEGINKGO TABLETS 90's", dp: 420, cp: 500, bv: 80, cif: 179 },
{ description: "YEEYANGYEN TABLET 30's", dp: 195, cp: 254, bv: 32, cif: 83 },
{ description: "YEEYANGYEN TABLET 90's", dp: 370, cp: 455, bv: 90, cif: 157 },
{ description: "INSTANT COFFEE MIX 20's x 30g", dp: 260, cp: 320, bv: 38, cif: 110 }];


// CIF breakdown data from official price list PDF (before August 2026)
// Keys are normalized descriptions matching STATIC_PRICE_LIST entries
const CIF_DATA = {
  "ARABICA COFFEE MIX W/GOAT'S AND GANO 25GX20'S": { code: 'NB1208', orig: 120, vat: 15, duty: 20, clearing: 1 },
  "BEE POLLEN CAPSULE (30'S)": { code: 'NB3801', orig: 75, vat: 15, duty: 0, clearing: 1 },
  "BEE POLLEN CAPSULE (100'S)": { code: 'NB3802', orig: 158, vat: 15, duty: 0, clearing: 1 },
  "BODY CONTOUR CREAM": { code: 'NB7825', orig: 162, vat: 15, duty: 20, clearing: 1 },
  "COMPACT POWDER 12G": { code: 'NB7859', orig: 108, vat: 15, duty: 20, clearing: 1 },
  "D.I GROW (GREEN) (1 LITER)": { code: 'NB9845', orig: 98, vat: 15, duty: 0, clearing: 1 },
  "D.I GROW (GREEN) (4LITERS)": { code: 'NB9830', orig: 328, vat: 15, duty: 0, clearing: 1 },
  "D.I GROW (RED) (1 LITER)": { code: 'NB9846', orig: 98, vat: 15, duty: 0, clearing: 1 },
  "D.I GROW (RED) (4LITERS)": { code: 'NB9829', orig: 328, vat: 15, duty: 0, clearing: 1 },
  "D.I GROW BIO-8 1 LTR": { code: 'NB9848', orig: 135, vat: 15, duty: 0, clearing: 1 },
  "D.I GROW K 1 LTR": { code: 'NB9850', orig: 158, vat: 15, duty: 0, clearing: 1 },
  "D.I. INSTANT GOAT'S MILK POWDER PREMIX 20'S X 21G": { code: 'NB2814', orig: 135, vat: 15, duty: 25, clearing: 1 },
  "D.I. INSTANT SOYBEAN MIXTURE WITH GINGER 25G X 20'": { code: 'NB2813', orig: 113, vat: 15, duty: 10, clearing: 1 },
  "DI LIQUID ALFALFA PLUS GUARANA (500ML)": { code: 'NB1802A', orig: 141, vat: 15, duty: 20, clearing: 1 },
  "DI LIQUID ALFALFAPLUS GUARANA (150ML)": { code: 'NB1801A', orig: 53, vat: 15, duty: 20, clearing: 1 },
  "DI NONI 500ML": { code: 'NB5802N', orig: 225, vat: 15, duty: 0, clearing: 1 },
  "DI NONI JUICE 1 L": { code: 'NB5802A', orig: 352, vat: 15, duty: 0, clearing: 1 },
  "DYNA C- 100 TABLET 150'S": { code: 'NB3805', orig: 78, vat: 15, duty: 0, clearing: 1 },
  "DYNA C- 250 TABLET 90'S": { code: 'NB3806', orig: 78, vat: 15, duty: 0, clearing: 1 },
  "DYNA 'S' TABLET 120'S": { code: 'NB5806', orig: 145, vat: 15, duty: 0, clearing: 1 },
  "DYNA SERENOA TABLET 100'S": { code: 'NB9918', orig: 235, vat: 15, duty: 0, clearing: 1 },
  "DYNA SERENOA TABLET 30'S": { code: 'NB9919', orig: 91, vat: 15, duty: 0, clearing: 1 },
  "DYNA TONIC (150ML)": { code: 'NB3803', orig: 75, vat: 15, duty: 20, clearing: 1 },
  "DYNA TONIC (780ML)": { code: 'NB3804', orig: 230, vat: 15, duty: 20, clearing: 1 },
  "DYNA TOOTHBRUSH (SET 3 OF 3)": { code: 'NB7833', orig: 45, vat: 15, duty: 10, clearing: 1 },
  "DYNA-RH CAPSULE 100'S": { code: 'NB6803', orig: 145, vat: 15, duty: 0, clearing: 1 },
  "E-VITA CREAM (50G)": { code: 'NB7816', orig: 412, vat: 15, duty: 20, clearing: 1 },
  "GANODERMA LOTION 150ML": { code: 'NB7916', orig: 86, vat: 15, duty: 20, clearing: 1 },
  "GANODERMA SHOWER GEL 150ML(GANODERMA BODY SCRUB)": { code: 'NB7920', orig: 98, vat: 15, duty: 20, clearing: 1 },
  "GANODERMA SOAP 2 X 100G": { code: 'NB7839', orig: 75, vat: 15, duty: 20, clearing: 1 },
  "GANODERMA TOOTHPASTE (150G)": { code: 'NB7919', orig: 60, vat: 15, duty: 20, clearing: 1 },
  "GINALI CAPSULE 100'S": { code: 'NB4811', orig: 165, vat: 15, duty: 0, clearing: 1 },
  "GINALI CAPSULE 30'S": { code: 'NB4812', orig: 90, vat: 15, duty: 0, clearing: 1 },
  "GINSENG CAPSULE 9 X 10'S": { code: 'NB4805', orig: 260, vat: 15, duty: 0, clearing: 1 },
  "GOAT'S MILK SOAP (100G)": { code: 'NB7834', orig: 45, vat: 15, duty: 20, clearing: 1 },
  "GOAT'S MILK TABLET 150'S": { code: 'NB2802', orig: 110, vat: 15, duty: 0, clearing: 1 },
  "GOAT'S MILK TABLET 75'S": { code: 'NB2803', orig: 65, vat: 15, duty: 0, clearing: 1 },
  "GREEN TEA CAPSULE 30'S": { code: 'NB3811', orig: 90, vat: 15, duty: 0, clearing: 1 },
  "GREEN TEA CAPSULE 60'S": { code: 'NB3812', orig: 172, vat: 15, duty: 0, clearing: 1 },
  "HERBA WARISAN MAHARANI 6 X 10G": { code: 'NB2812', orig: 230, vat: 15, duty: 20, clearing: 1 },
  "HIGH FIBER NUTRITION FOOD 30'SX25G": { code: 'NB5807', orig: 330, vat: 15, duty: 0, clearing: 1 },
  "INSTANT CAPPUCCINO W/ GANO 15'S X 35G": { code: 'NB1205', orig: 113, vat: 15, duty: 20, clearing: 1 },
  "INSTANT CEREAL 15'S X 32G": { code: 'NB5801N', orig: 143, vat: 15, duty: 10, clearing: 1 },
  "INSTANT CEREAL 30'S X 32G": { code: 'NB5801', orig: 255, vat: 15, duty: 10, clearing: 1 },
  "INSTANT CHOC W/ GANO 30'S X 30G": { code: 'NB1814', orig: 150, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE MIX W/GANODERMA, COLLAGEN & KACIP": { code: 'NB1203', orig: 88, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE MIX W/TONGKAT & MACA POWDER(15'SX21G)": { code: 'NB1204', orig: 88, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE MIX WITH GANODERMA 4-IN-1(SACHET) (20'S X 21G)": { code: 'NB1804', orig: 88, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE W/ GANO, GREEN TEA 20'S X 21G": { code: 'NB1202', orig: 105, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE W/ GINKGO & GINSENG 20'S X 21G": { code: 'NB1201', orig: 105, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE W/ TONGKAT ALI 20'S X 21G": { code: 'NB4810', orig: 88, vat: 15, duty: 20, clearing: 1 },
  "INSTANT COFFEE W/GANO & TONGKAT ALI BLACK 30'S X 5G": { code: 'NB1818', orig: 120, vat: 15, duty: 20, clearing: 1 },
  "INSTANT GINSENG HONEY GINGER 500G": { code: 'NB4803', orig: 129, vat: 15, duty: 20, clearing: 1 },
  "INSTANT PEGAGA CAFE 25G X 15S": { code: 'NB1206', orig: 97, vat: 15, duty: 20, clearing: 1 },
  "INSTANT PREMIX COFFEE WITH MANGOSTEEN(25'SX15G)": { code: 'NB1210', orig: 115, vat: 15, duty: 20, clearing: 1 },
  "INSTANT WHEATGRASS W/ CHLOROPHYLL 20'S X 10G": { code: 'NB1812', orig: 102, vat: 15, duty: 20, clearing: 1 },
  "MILK TEA WITH TONGKAT ALI 21G X 20'S": { code: 'NB4810N', orig: 103, vat: 15, duty: 20, clearing: 1 },
  "MILK THISTLE TABLET 120'S": { code: 'NB4817', orig: 250, vat: 15, duty: 0, clearing: 1 },
  "MILK THISTLE TABLET 30'S": { code: 'NB4816', orig: 77, vat: 15, duty: 0, clearing: 1 },
  "MINERAL POT": { code: 'NB8805', orig: 675, vat: 15, duty: 20, clearing: 1 },
  "NANO HOME FEMININE WASH ANTISEPTIC W/ SIRIH 60ML": { code: 'NB7842', orig: 35, vat: 15, duty: 20, clearing: 1 },
  "NANO HOME FEMININE WASH KACIP FATIMAH 60ML": { code: 'NB7841', orig: 36, vat: 15, duty: 20, clearing: 1 },
  "NANO HOME FEMININE WASH WITH GAMAT 60ML": { code: 'NB7843', orig: 35, vat: 15, duty: 20, clearing: 1 },
  "NANO HOME GAMAT SOAP 100G": { code: 'NB7840', orig: 41, vat: 15, duty: 20, clearing: 1 },
  "NANO HOME PEGAGA SOAP 100G": { code: 'NB7838', orig: 31, vat: 15, duty: 20, clearing: 1 },
  "NONI PLUS TEA 30'S X 3G": { code: 'NB5803', orig: 145, vat: 15, duty: 20, clearing: 1 },
  "NUTMEG OINTMENT (2'S X 20G)": { code: 'NB6802', orig: 85, vat: 15, duty: 20, clearing: 1 },
  "PRESIDENT'S CHOICE 4 IN 1 AND CHOCOLATE COFFEE 20'": { code: 'NB1817', orig: 135, vat: 15, duty: 20, clearing: 1 },
  "PRO- LSB TABLET 150'S": { code: 'NB2809', orig: 225, vat: 15, duty: 0, clearing: 1 },
  "PROLINK 20'S X 20G": { code: 'NB3814', orig: 294, vat: 15, duty: 20, clearing: 1 },
  "PROLINK 30'S X 20G": { code: 'NB3816N', orig: 382, vat: 15, duty: 20, clearing: 1 },
  "RED COFFEE W/ GINSENG (12'S X 25G)": { code: 'NB3810', orig: 90, vat: 15, duty: 20, clearing: 1 },
  "REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)": { code: 'NB10804', orig: 375, vat: 15, duty: 20, clearing: 1 },
  "REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)": { code: 'NB10805A', orig: 375, vat: 15, duty: 20, clearing: 1 },
  "SEA CUCUMBER JELLY (250ML)": { code: 'NB4808', orig: 125, vat: 15, duty: 20, clearing: 1 },
  "SEA CUCUMBER JELLY (500ML)": { code: 'NB4808A', orig: 227, vat: 15, duty: 20, clearing: 1 },
  "SEA WATER SPIRULINA POWDER 500G": { code: 'NB2805', orig: 141, vat: 15, duty: 10, clearing: 1 },
  "SOYBEAN POWDER 454G": { code: 'NB2804', orig: 98, vat: 15, duty: 10, clearing: 1 },
  "SPIRULINA TABLET (1,000'S)": { code: 'NB2808', orig: 360, vat: 15, duty: 0, clearing: 1 },
  "SPIRULINA TABLET (100'S)": { code: 'NB2806', orig: 68, vat: 15, duty: 0, clearing: 1 },
  "SPIRULINA TABLET (300'S)": { code: 'NB2807', orig: 150, vat: 15, duty: 0, clearing: 1 },
  "TEA TREE OIL FEMININE WASH (250ML)": { code: 'NB7835', orig: 100, vat: 15, duty: 20, clearing: 1 },
  "TEA TREE OIL LOTION (250ML)": { code: 'NB7813', orig: 96, vat: 15, duty: 20, clearing: 1 },
  "TEA TREE OIL TOOTHPASTE (175G)": { code: 'NB7837', orig: 60, vat: 15, duty: 20, clearing: 1 },
  "TONGKAT ALI CAPSULE 100'S": { code: 'NB4823', orig: 188, vat: 15, duty: 0, clearing: 1 },
  "TONGKAT ALI CAPSULE 30'S": { code: 'NB4822', orig: 77, vat: 15, duty: 0, clearing: 1 },
  "YEEGANO CAPSULE 30'S": { code: 'NB1809', orig: 68, vat: 15, duty: 0, clearing: 1 },
  "YEEGANO CAPSULE 90'S": { code: 'NB1810', orig: 158, vat: 15, duty: 0, clearing: 1 },
  "YEEGARLIC CAPSULE 90'S": { code: 'NB1811', orig: 135, vat: 15, duty: 0, clearing: 1 },
  "YEEGINKGO TABLET (30'S)": { code: 'NB4814', orig: 68, vat: 15, duty: 0, clearing: 1 },
  "YEEGINKGO TABLETS 90'S": { code: 'NB4815', orig: 165, vat: 15, duty: 0, clearing: 1 },
  "YEEYANGYEN TABLET 30'S": { code: 'NB3808', orig: 74, vat: 15, duty: 0, clearing: 1 },
  "YEEYANGYEN TABLET 90'S": { code: 'NB3809', orig: 185, vat: 15, duty: 0, clearing: 1 }
};

const STATIC_PACKAGE_LIST = [
{ description: 'Gastric Package', dp: 2054, cp: 2432, cif: 0, bv: 381 },
{ description: 'Womens Package', dp: 2543, cp: 2950, cif: 0, bv: 481 },
{ description: 'Mens Health Package', dp: 2033, cp: 2362, cif: 0, bv: 388 },
{ description: 'Blood Circulation Pack', dp: 3290, cp: 3854, cif: 0, bv: 657 },
{ description: 'Cleansing And Detoxification Package', dp: 2183, cp: 2596, cif: 0, bv: 447 },
{ description: 'Weight Management Pack', dp: 2283, cp: 2680, cif: 0, bv: 448 },
{ description: 'Healthy Joints Package', dp: 3538, cp: 4177, cif: 0, bv: 687.5 }];


async function initProductPricesTable() {
  try {
    const { query } = await import('./api/db.js');
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1195:40"), []);











    await __qd_executePlan(query, __qd_registeredPlan("server.js:1207:41"), []);

    // ── Price change history ──────────────────────────────────────────────────
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1210:42"), []);
















    await __qd_executePlan(query, __qd_registeredPlan("server.js:1227:43"), []);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1228:44"), []);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1229:45"), []);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1230:46"), []);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1231:47"), []);

    // Never delete/rename duplicates during startup: cascading deletion destroys
    // price history. Reconciliation is a backed-up, GM-confirmed operation.
    const { ensurePriceImportSchema } = await import('./api/services/priceImport.js');
    const { nameKey } = await import('./shared/price-list-import.js');
    await ensurePriceImportSchema();
    const { withRequestTransaction } = await import('./api/db.js');
    await withRequestTransaction(async () => {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:1240:48"), []);
      const seedRows = (await __qd_executePlan(query, __qd_registeredPlan("server.js:1241:49"), [])).
      rows;
      const seededNames = new Set(seedRows.map((row) => nameKey(row.description)));

      let inserted = 0,updated = 0;
      for (const p of STATIC_PRICE_LIST) {
        if (seededNames.has(nameKey(p.description))) continue;
        const res = await __qd_executePlan(query, __qd_registeredPlan("server.js:1249:50"),


        [String(p.description).trim().toUpperCase().replace(/\s+/g, ' '), p.dp, p.cp, p.cif, p.bv]);

        if (res.rowCount > 0) {if (res.command === 'INSERT') inserted++;else updated++;}
      }
      if (inserted > 0) console.log(`Seeded ${inserted} new products into product_prices`);
      if (updated > 0) console.log(`Corrected prices for ${updated} system-seeded products`);
      for (const pkg of STATIC_PACKAGE_LIST) {
        if (seededNames.has(nameKey(pkg.description))) continue;
        await __qd_executePlan(query, __qd_registeredPlan("server.js:1260:51"),


        [String(pkg.description).trim().toUpperCase().replace(/\s+/g, ' '), pkg.dp, pkg.cp, pkg.cif, pkg.bv]);

      }
      console.log(`Ensured ${STATIC_PACKAGE_LIST.length} packages in product_prices`);

      // Seed product codes and CIF breakdown data from official PDF price list
      let cifSeeded = 0;
      for (const [normalizedDesc, d] of Object.entries(CIF_DATA)) {
        const res = await __qd_executePlan(query, __qd_registeredPlan("server.js:1271:52"),







        [d.code, d.orig, d.vat, d.duty, d.clearing, normalizedDesc]);

        if (res.rowCount > 0) cifSeeded++;
      }
      if (cifSeeded > 0) console.log(`[prices] Seeded CIF data + codes for ${cifSeeded} products`);
    });
  } catch (err) {
    console.error('initProductPricesTable error:', err.message);
  }
}
runStartupOperation(startupPolicy, 'price-catalogue-bootstrap', initProductPricesTable);

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
    const { activateDuePrices } = await import('./api/services/priceImport.js');
    const count = await activateDuePrices();
    if (count) console.log(`[prices] Applied ${count} scheduled price change(s)`);
  } catch (err) {
    console.error('[prices] applyPendingPriceChanges error:', err.message);
  }
}
// Run once at startup and then every hour
runStartupOperation(startupPolicy, 'price-activation-timer',
() => setInterval(applyPendingPriceChanges, 60 * 60 * 1000));

app.use('/api/prices', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(String(req.user.role).toLowerCase())) return res.status(403).json({ error: 'General Manager permission required' });
  next();
});
const priceActor = (req) => req.user?.fullName || req.user?.username || req.user?.sub;
const priceMutation = (handler) => atomicStockRequest(async (req, res) => {
  const { query } = await import('./api/db.js');
  await __qd_executePlan(query, __qd_registeredPlan("server.js:1331:53"), []);
  await handler(req, res);
});
const priceEndpoint = (fn) => async (req, res) => {
  try {res.json(await fn(req));} catch (error) {res.status(error.status || 500).json({ error: error.message });}
};
app.post('/api/prices/import-preview', priceEndpoint(async (req) => {
  const { ensurePriceImportSchema, previewImport } = await import('./api/services/priceImport.js');
  const { withTransaction } = await import('./api/db.js');
  await ensurePriceImportSchema();
  return withTransaction((client) => previewImport(client, req.body.products, req.body.effective_from));
}));
app.post('/api/prices/bulk-import', priceEndpoint(async (req) => {
  const { importPrices } = await import('./api/services/priceImport.js');
  return importPrices(req.body.products, req.body.effective_from, priceActor(req));
}));
const manualPriceEndpoint = (fn) => priceEndpoint(async (req) => {
  try {return await fn(req);} catch (error) {
    if (['42P01', '42703'].includes(error.code)) throw Object.assign(new Error('Manual price control requires reviewed additive migration 035; no schema changes were attempted'), { status: 503 });
    throw error;
  }
});
app.get('/api/prices/manual-schedules', manualPriceEndpoint(async (req) =>
(await import('./api/services/manualPriceControl.js')).listManualPrices(req.user)));
app.post('/api/prices/manual-schedules/:id/activate', manualPriceEndpoint(async (req) =>
(await import('./api/services/manualPriceControl.js')).activateManualPrice(req.params.id, req.body, req.user)));
app.post('/api/prices/manual-schedules/:id/compensate', manualPriceEndpoint(async (req) =>
(await import('./api/services/manualPriceControl.js')).compensateManualPrice(req.params.id, req.body, req.user)));
app.get('/api/prices/duplicates', priceEndpoint(async (req) => {
  if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (!['gm', 'admin', 'superadmin', 'super_admin'].includes(String(req.user.role).toLowerCase())) throw Object.assign(new Error('General Manager permission required'), { status: 403 });
  return (await import('./api/services/priceImport.js')).reviewDuplicates();
}));
app.post('/api/prices/reconcile', priceEndpoint(async (req) => {
  const result = await (await import('./api/services/priceImport.js')).reconcileDuplicates(req.body, priceActor(req));
  await (await import('./api/db.js')).publishRealtimeEvent('prices', 'reconciled', result);
  return result;
}));

app.get('/api/prices', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    // Show every active identity. Unresolved distinct-code products must never
    // be hidden by a description-only DISTINCT or client-side heuristic.
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1375:54"), []);


    res.json(rows);
  } catch (err) {
    console.error('GET /api/prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prices', priceMutation(async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    // Accept both legacy array body and new {updates, effective_from} body
    const updates = Array.isArray(req.body) ? req.body : req.body?.updates || [];
    const effectiveFrom = Array.isArray(req.body) ? null : req.body?.effective_from || null;
    if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'Expected array of price updates' });
    const { businessToday } = await import('./shared/price-list-import.js');
    const { validateDate } = await import('./api/services/priceImport.js');
    const today = businessToday();
    validateDate(effectiveFrom, today);
    const isImmediate = !effectiveFrom || effectiveFrom === today;
    const updatedBy = priceActor(req);
    let count = 0;
    for (const u of updates) {
      if (!u.id) continue;
      const { rows: old } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1401:55"), [u.id]);
      if (!old.length) continue;
      const o = old[0];
      const newDp = Number(u.dp) || 0,newCp = Number(u.cp) || 0,newCif = Number(u.cif) || 0,newBv = Number(u.bv) || 0;
      const changed = o.dp != newDp || o.cp != newCp || o.cif != newCif || o.bv != newBv;
      if (changed) {
        await __qd_executePlan(query, __qd_registeredPlan("server.js:1408:56"),


        [u.id, o.description, o.dp, o.cp, o.cif, o.bv, newDp, newCp, newCif, newBv, updatedBy, effectiveFrom || today, isImmediate ? 'applied' : 'pending']);

      }
      if (isImmediate) {
        // Build dynamic SET for price + any CIF breakdown fields included in update
        const setClauses = [__qd_registeredPlan("server.js:1415:57"), __qd_registeredPlan("server.js:1415:58"), __qd_registeredPlan("server.js:1415:59"), __qd_registeredPlan("server.js:1415:60"), __qd_registeredPlan("server.js:1415:61"), __qd_registeredPlan("server.js:1415:62")];
        const setVals = [newDp, newCp, newCif, newBv, updatedBy];
        let sIdx = 6;
        if (u.product_code !== undefined) {setClauses.push(__qd_registeredPlan("server.js:1418:63", [sIdx++]));setVals.push(u.product_code || null);}
        if (u.original_cif !== undefined) {setClauses.push(__qd_registeredPlan("server.js:1419:64", [sIdx++]));setVals.push(u.original_cif != null ? Number(u.original_cif) : null);}
        if (u.vat_pct !== undefined) {setClauses.push(__qd_registeredPlan("server.js:1420:65", [sIdx++]));setVals.push(Number(u.vat_pct) || 15);}
        if (u.import_duty_pct !== undefined) {setClauses.push(__qd_registeredPlan("server.js:1421:66", [sIdx++]));setVals.push(Number(u.import_duty_pct) || 0);}
        if (u.clearing_fee !== undefined) {setClauses.push(__qd_registeredPlan("server.js:1422:67", [sIdx++]));setVals.push(Number(u.clearing_fee) || 1);}
        setVals.push(u.id);
        await __qd_executePlan(query, __qd_registeredPlan("server.js:1424:68", [__qd_joinPlans(setClauses, "compactComma"), sIdx]), setVals);
      }
      count++;
    }
    res.json({ success: true, updated: count, pending: !isImmediate, effective_from: effectiveFrom || today });
  } catch (err) {
    console.error('PUT /api/prices error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
}));

app.patch('/api/prices/:id', priceMutation(async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { id } = req.params;
    const { dp, cp, cif, bv, description, product_code, original_cif, vat_pct, import_duty_pct, clearing_fee } = req.body;
    const updatedBy = req.user?.name || req.user?.username || 'gm';
    // Snapshot old values before patching
    const { rows: old } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1442:69"), [id]);
    if (!old.length) return res.status(409).json({ error: 'This product is absent or archived. Refresh the active price list.' });
    const fields = [];
    const vals = [];
    let i = 1;
    if (dp !== undefined) {fields.push(__qd_registeredPlan("server.js:1447:70", [i++]));vals.push(Number(dp) || 0);}
    if (cp !== undefined) {fields.push(__qd_registeredPlan("server.js:1448:71", [i++]));vals.push(Number(cp) || 0);}
    if (cif !== undefined) {fields.push(__qd_registeredPlan("server.js:1449:72", [i++]));vals.push(Number(cif) || 0);}
    if (bv !== undefined) {fields.push(__qd_registeredPlan("server.js:1450:73", [i++]));vals.push(Number(bv) || 0);}
    if (description !== undefined) {fields.push(__qd_registeredPlan("server.js:1451:74", [i++]));vals.push(String(description));}
    if (product_code !== undefined) {fields.push(__qd_registeredPlan("server.js:1452:75", [i++]));vals.push(product_code || null);}
    if (original_cif !== undefined) {fields.push(__qd_registeredPlan("server.js:1453:76", [i++]));vals.push(original_cif != null ? Number(original_cif) : null);}
    if (vat_pct !== undefined) {fields.push(__qd_registeredPlan("server.js:1454:77", [i++]));vals.push(Number(vat_pct) || 15);}
    if (import_duty_pct !== undefined) {fields.push(__qd_registeredPlan("server.js:1455:78", [i++]));vals.push(Number(import_duty_pct) || 0);}
    if (clearing_fee !== undefined) {fields.push(__qd_registeredPlan("server.js:1456:79", [i++]));vals.push(Number(clearing_fee) || 1);}
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(__qd_registeredPlan("server.js:1458:80"), __qd_registeredPlan("server.js:1458:81", [i++]));
    vals.push(updatedBy, id);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1460:82", [__qd_joinPlans(fields, "compactComma"), i]), vals);
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1461:83"), [id]);
    // Log history if price values changed
    if (old.length && rows.length) {
      const o = old[0],n = rows[0];
      const changed = o.dp != n.dp || o.cp != n.cp || o.cif != n.cif || o.bv != n.bv;
      if (changed) {
        await __qd_executePlan(query, __qd_registeredPlan("server.js:1468:84"),


        [id, o.description, o.dp, o.cp, o.cif, o.bv, n.dp, n.cp, n.cif, n.bv, updatedBy]);

      }
    }
    res.json(rows[0] || { success: true });
  } catch (err) {
    console.error('PATCH /api/prices/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
}));

// Sales analytics per product — last 90 days of branch inventory movements
app.get('/api/prices/analytics', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1485:85"), []);























    res.json({ success: true, products: rows });
  } catch (err) {
    console.error('GET /api/prices/analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prices/pending', async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1520:86"), []);






    const additions = (await __qd_executePlan(query, __qd_registeredPlan("server.js:1526:87"), [])).




    rows;
    res.json({ success: true, pending: [...rows, ...additions] });
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
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1546:88", [



    cond,

    Number(limit) || 200]),
    params);

    res.json({ success: true, history: rows });
  } catch (err) {
    console.error('GET /api/prices/history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prices', priceMutation(async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const { importPrices } = await import('./api/services/priceImport.js');
    const { businessToday, resolveProduct } = await import('./shared/price-list-import.js');
    await importPrices([req.body], businessToday(), priceActor(req));
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:1567:89"), []);
    res.json(resolveProduct(req.body, rows).existing);
  } catch (err) {
    console.error('POST /api/prices error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
}));

app.delete('/api/prices/:id', priceMutation(async (req, res) => {
  try {
    const { query } = await import('./api/db.js');
    const evidence = await __qd_executePlan(query, __qd_registeredPlan("server.js:1578:90"),
    [req.params.id]);
    if (evidence.rowCount) return res.status(409).json({ error: 'This identity has price history or reconciliation evidence. It cannot be deleted; use the GM duplicate review.' });
    await __qd_executePlan(query, __qd_registeredPlan("server.js:1581:91"), [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));
// ── End Product Price Routes ────────────────────────────────────────────────────

// ─── Centralized Stock Engine Read Endpoints ─────────────────────────────────

app.get('/api/stock/branch/:branchId/card', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const branchId = req.params.branchId;
    const startDate = req.query.from || new Date(new Date().setDate(1)).toISOString().slice(0, 10);
    const endDate = req.query.to || new Date().toISOString().slice(0, 10);

    const [balances, movements] = await Promise.all([__qd_executePlan(
      getMany, __qd_registeredPlan("server.js:1600:92"),

      [branchId]), __qd_executePlan(

      getMany, __qd_registeredPlan("server.js:1604:93"),





      [startDate, endDate, branchId])]

    );

    const productCount = new Set(balances.filter((b) => Number(b.closing_qty) > 0).map((b) => b.product_name)).size;
    const closingStock = balances.reduce((s, b) => s + Number(b.closing_qty || 0), 0);
    const stockValueDP = balances.reduce((s, b) => s + Number(b.stock_value_dp || 0), 0);
    const salesUnits = movements.
    filter((m) => ['walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'sale'].includes(m.movement_type) && m.source_location === branchId).
    reduce((s, m) => s + Number(m.quantity || 0), 0);
    const dispensedUnits = movements.
    filter((m) => m.movement_type === 'prescription_dispense' && m.source_location === branchId).
    reduce((s, m) => s + Number(m.quantity || 0), 0);

    res.json({ success: true, branchId, productCount, closingStock, stockValueDP, salesUnits, dispensedUnits });
  } catch (err) {
    console.error('[stock/branch/card]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stock/branch/:branchId/inventory', async (req, res) => {
  try {
    const { getMany } = await import('./api/db.js');
    const { normalizeBranchSlug } = await import('./api/_lib/branchUtils.js');
    const rawId = req.params.branchId;

    // Build a comprehensive candidate list so any alias variant stored in the DB matches.
    const canonical = normalizeBranchSlug(rawId) || rawId.trim().toLowerCase();
    const raw_lc = rawId.trim().toLowerCase();
    const candidateSet = new Set([canonical, raw_lc]);
    // _branch suffix variants
    if (canonical.endsWith('_branch')) candidateSet.add(canonical.replace(/_branch$/, ''));else
    candidateSet.add(canonical + '_branch');
    if (raw_lc.endsWith('_branch')) candidateSet.add(raw_lc.replace(/_branch$/, ''));else
    candidateSet.add(raw_lc + '_branch');
    // Known alias pairs
    if (['townshop', 'windhoek_cbd', 'windhoek'].includes(canonical)) {
      ['townshop', 'windhoek_cbd', 'windhoek'].forEach((a) => candidateSet.add(a));
    }
    if (['katima_mulilo', 'katima', 'katima-mulilo'].includes(canonical)) {
      ['katima_mulilo', 'katima', 'katima-mulilo', 'katima_branch', 'katima_mulilo_branch'].forEach((a) => candidateSet.add(a));
    }
    if (['oshakati_branch', 'oshakati'].includes(canonical)) {
      ['oshakati_branch', 'oshakati'].forEach((a) => candidateSet.add(a));
    }
    if (['hochland-park', 'hochlandpark', 'hochland_park'].includes(canonical)) {
      ['hochland-park', 'hochlandpark', 'hochland_park'].forEach((a) => candidateSet.add(a));
    }
    if (['walvisbay', 'walvis_bay'].includes(canonical)) {
      ['walvisbay', 'walvis_bay', 'walvis bay'].forEach((a) => candidateSet.add(a));
    }

    const candidates = [...candidateSet].filter(Boolean);

    // Query branch_inventory_batches — physical stock source of truth for branches
    // that use the transactional batch system (e.g. townshop).
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1667:94"),





    [candidates]);


    // Build inventory map keyed by lowercase product name.
    const inventoryMap = new Map();
    for (const r of rows) {
      const key = (r.product_name || '').trim().toLowerCase();
      if (!key) continue;
      const existing = inventoryMap.get(key);
      const qty = Number(r.total_qty || 0);
      if (!existing || qty > existing.availableQty) {
        inventoryMap.set(key, {
          productName: r.product_name,
          availableQty: qty,
          closingQty: qty,
          expiryDate: r.earliest_expiry ? String(r.earliest_expiry).slice(0, 10) : null
        });
      }
    }

    // Fallback: for branches that use inventory_balances (centralized stock engine path),
    // BIB will be empty. Merge inventory_balances so the consultant sees the correct
    // in-stock / out-of-stock status for those branches (e.g. Tsumeb, Gobabis, etc.).
    // BIB rows take precedence over IB rows for the same product (BIB is authoritative
    // when it exists).
    try {
      const ibRows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1699:95"),





      [candidates]);

      for (const r of ibRows) {
        const key = (r.product_name || '').trim().toLowerCase();
        if (!key) continue;
        if (inventoryMap.has(key)) continue; // BIB already has this product — prefer BIB
        const qty = Number(r.total_qty || 0);
        inventoryMap.set(key, {
          productName: r.product_name,
          availableQty: qty,
          closingQty: qty,
          expiryDate: r.earliest_expiry ? String(r.earliest_expiry).slice(0, 10) : null
        });
      }
    } catch (ibErr) {
      console.error('[stock/branch/inventory] inventory_balances fallback error:', ibErr.message);
    }

    const inventory = [...inventoryMap.values()].sort((a, b) =>
    (a.productName || '').localeCompare(b.productName || '')
    );
    res.json({ success: true, branchId: rawId, inventory });
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
    let dateFilter = __qd_registeredPlan("server.js:1739:96");
    if (from) {params.push(from);dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("server.js:1740:97", [params.length])], "empty");}
    if (to) {params.push(to + 'T23:59:59');dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("server.js:1741:98", [params.length])], "empty");}
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1743:99", [


    dateFilter]),

    params);

    const fmt = (d) => d ? d instanceof Date ? d.toISOString() : String(d) : null;
    res.json(rows.map((r) => ({ ...r, quantity: Number(r.quantity || 0), created_at: fmt(r.created_at) })));
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
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1762:100"), []);










    res.json(rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity || 0),
      dp: Number(r.dp || 0),
      cif: Number(r.cif || 0),
      location: r.branch_id,
      locationType: 'branch',
      description: r.product_name,
      remaining_quantity: Number(r.quantity || 0),
      dpc_unit_value: Number(r.dp || 0),
      cif_unit_cost: Number(r.cif || 0)
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
    let dateFilter = __qd_registeredPlan("server.js:1800:101");
    if (from) {params.push(from);dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("server.js:1801:102", [params.length])], "empty");}
    if (to) {params.push(to + 'T23:59:59');dateFilter = __qd_joinPlans([dateFilter, __qd_registeredPlan("server.js:1802:103", [params.length])], "empty");}

    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1805:104", [






    dateFilter]),


    params);


    const fmt = (d) => d ? d instanceof Date ? d.toISOString() : String(d) : null;
    const movements = rows.map((r) => ({
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
      createdAt: fmt(r.created_at)
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
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1846:105"),



    [warehouseId]);

    const inventory = rows.map((r) => ({
      id: r.id,
      productName: r.product_name,
      batchNo: r.batch_no,
      expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
      closingQty: Number(r.closing_qty || 0),
      inwardQty: Number(r.inward_qty || 0),
      outwardQty: Number(r.outward_qty || 0),
      unitDP: r.unit_dp ? Number(r.unit_dp) : null,
      stockValueDP: Number(r.stock_value_dp || 0)
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
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1873:106"), []);










    const summary = rows.map((r) => ({
      productName: r.product_name,
      totalIn: Number(r.total_in || 0),
      totalOut: Number(r.total_out || 0),
      closingQty: Number(r.closing_qty || 0),
      stockValueDP: Number(r.stock_value_dp || 0)
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
    const dist = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:1917:107"),



    [nb]);

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
    const report = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:1935:108"), [id]);
    if (!report) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof report.data === 'string' ? JSON.parse(report.data || '{}') : report.data || {};
    const dispenses = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:1939:109"),


    [id]);

    const dispensedByProduct = {};
    for (const d of dispenses) {
      dispensedByProduct[d.product_name] = (dispensedByProduct[d.product_name] || 0) + Number(d.quantity);
    }
    const prescription = (data.prescription || []).map((item) => {
      const dispensed = dispensedByProduct[item.productName || item.product_name] || 0;
      const prescribed = Number(item.prescribedQty || item.quantity || 0);
      return {
        productId: item.productId || null,
        productName: item.productName || item.product_name,
        prescribedQty: prescribed,
        dispensedQtyTotal: dispensed,
        remainingQty: Math.max(0, prescribed - dispensed),
        status: dispensed === 0 ? 'pending' : dispensed >= prescribed ? 'fully_dispensed' : 'partially_dispensed'
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
        referralNb: data.referralNb || data.referral?.nb || null
      },
      assessment: { symptoms: data.symptoms || '', notes: data.notes || '' },
      prescription,
      reportType: report.report_type,
      branch: report.branch,
      consultant: report.consultant,
      createdAt: report.created_at,
      clientWantsReport: data.clientWantsReport !== undefined ? data.clientWantsReport : true
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
    const report = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:1988:110"), [id]);
    if (!report) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof report.data === 'string' ? JSON.parse(report.data || '{}') : report.data || {};
    return res.json({
      success: true,
      consultation: { ...data, id: report.id, branch: report.branch, consultant: report.consultant, createdAt: report.created_at },
      prescription: data.prescription || [],
      reportEligible: data.clientWantsReport !== false
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
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2014:111"), [id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Consultation not found' });
    const data = typeof existing.data === 'string' ? JSON.parse(existing.data || '{}') : existing.data || {};
    data.clientWantsReport = clientWantsReport;
    await __qd_executePlan(query, __qd_registeredPlan("server.js:2018:112"), [JSON.stringify(data), id]);
    return res.json({ success: true, consultationId: id, clientWantsReport });
  } catch (err) {
    console.error('[consultations/:id/report-preference]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/prescriptions/:id/dispense  (partial/full dispensing with batch+expiry)
app.post('/api/prescriptions/:id/dispense', async (req, res) => {
  try {
    const { query: dbQuery, getMany, withTransaction: dbTransaction } = await import('./api/db.js');
    const { recomputeLocationBalances } = await import('./api/services/stockEngine.js');
    const prescriptionId = req.params.id;
    const historicalIssue = (await dbQuery('SELECT data FROM reports WHERE id=$1', [prescriptionId])).rows[0];
    if (historicalIssue?.data?.offSystemFulfilment) return res.status(409).json({ error: 'Use assigned-branch pending fulfilment for this historical form' });
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

    await dbTransaction(async (client) => {
      for (const item of items) {
        const productName = item.productName || item.product_name || '';
        if (!productName) continue;
        const qty = Number(item.dispenseQty);
        const unitDP = Number(item.unitDP || 0);

        // Deduct from branch_inventory_batches (WHERE quantity >= $1 prevents negative stock)
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:2063:113"),



        [qty, branchId, productName, item.batchNo]);


        // Insert branch_inventory_movements record
        const movId = `BIM-${ts}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:2072:114"),


        [movId, branchId, productName, item.batchNo, qty, prescriptionId, `Partial dispense ref ${prescriptionId}`, dispensedBy || 'system']);


        // Post to stock_movements
        const smId = `MOV-${ts}-${Math.random().toString(36).slice(2, 6)}`;
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:2080:115"),


        [smId, productName, item.batchNo, item.expiryDate, qty, branchId, prescriptionId, `Prescription dispense ${prescriptionId}`, unitDP]);


        posted.push({ productName, batchNo: item.batchNo, dispenseQty: qty, dispenseRef });
      }
    });

    recomputeLocationBalances('branch', branchId).catch(() => {});

    return res.status(201).json({
      success: true,
      prescriptionId,
      saveMode: saveMode || 'partial',
      dispenseRef,
      itemsDispensed: posted.length,
      items: posted,
      message: `${saveMode === 'full' ? 'Full' : 'Partial'} dispense recorded for prescription ${prescriptionId}`
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
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:2112:116"),






    [prescriptionId]);

    const history = rows.map((r) => ({
      dispenseDate: r.dispense_date,
      productName: r.product_name,
      batchNo: r.batch_no,
      dispensedQty: Number(r.dispensed_qty),
      dispensedBy: r.dispensed_by,
      receiptId: r.receipt_id
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
    const report = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2140:117"), [prescriptionId]);
    const data = report ? typeof report.data === 'string' ? JSON.parse(report.data || '{}') : report.data || {} : {};
    const prescription = data.prescription || [];
    const dispenses = await __qd_executePlan(getMany, __qd_registeredPlan("server.js:2144:118"),




    [prescriptionId]);

    const dispensedMap = new Map(dispenses.map((d) => [d.product_name, Number(d.total_dispensed)]));
    const items = prescription.map((item) => {
      const name = item.productName || item.product_name || '';
      const prescribed = Number(item.prescribedQty || item.quantity || 0);
      const dispensed = dispensedMap.get(name) || 0;
      const remaining = Math.max(0, prescribed - dispensed);
      return {
        productName: name,
        prescribedQty: prescribed,
        dispensedQtyTotal: dispensed,
        remainingQty: remaining,
        status: dispensed === 0 ? 'pending' : remaining === 0 ? 'fully_dispensed' : 'partially_dispensed'
      };
    });
    const overallStatus = items.length === 0 ? 'no_prescription' :
    items.every((i) => i.status === 'fully_dispensed') ? 'fully_dispensed' :
    items.some((i) => i.dispensedQtyTotal > 0) ? 'partially_dispensed' :
    'pending';
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
    const sale = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2180:119"), [saleId]);
    if (!sale) return res.status(404).json({ success: false, error: `Sale ${saleId} not found` });
    const items = typeof sale.items === 'string' ? JSON.parse(sale.items || '[]') : sale.items || [];
    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata || '{}') : sale.metadata || {};
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
      createdAt: sale.created_at
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

    const sale = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2216:120"), [receiptId]);
    if (!sale) return res.status(404).json({ success: false, error: `Receipt ${receiptId} not found` });

    const rawItems = typeof sale.items === 'string' ? JSON.parse(sale.items || '[]') : sale.items || [];
    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata || '{}') : sale.metadata || {};

    const { getOne: branchRow } = await import('./api/db.js');
    const branch = await branchRow(`SELECT name FROM branches WHERE id = $1`, [sale.branch_id]);

    const items = rawItems.map((i) => ({
      productName: i.productName || i.name || i.product_name || '',
      quantity: Number(i.quantity || i.qty || 0),
      unitPrice: Number(i.unitPrice || i.unit_price || i.price || 0),
      lineTotal: Number(i.lineTotal || i.line_total || i.quantity * (i.unitPrice || i.unit_price || 0) || 0),
      batchNo: i.batchNo || i.batch_no || null,
      expiryDate: i.expiryDate || i.expiry_date || null
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
      createdBy: sale.created_by
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
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:2265:121"), []);











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
      conds.push(__qd_registeredPlan("server.js:2295:123", [n, n]));
    }
    if (period) {params.push(period);conds.push(__qd_registeredPlan("server.js:2297:124", [params.length]));}
    if (status) {params.push(status);conds.push(__qd_registeredPlan("server.js:2298:125", [params.length]));}
    const where = conds.length ? __qd_joinPlans([__qd_registeredPlan("server.js:2299:122"), __qd_joinPlans(conds, "and")], "empty") : __qd_registeredPlan("server.js:2299:126");
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("server.js:2301:127", [



    where]),


    params);

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
    if (status) {params.push(status);conds.push(__qd_registeredPlan("server.js:2326:129", [params.length]));}
    if (type) {params.push(type);conds.push(__qd_registeredPlan("server.js:2327:130", [params.length]));}
    if (from) {params.push(from);conds.push(__qd_registeredPlan("server.js:2328:131", [params.length]));}
    if (to) {params.push(to);conds.push(__qd_registeredPlan("server.js:2329:132", [params.length]));}
    const where = conds.length ? __qd_joinPlans([__qd_registeredPlan("server.js:2330:128"), __qd_joinPlans(conds, "and")], "empty") : __qd_registeredPlan("server.js:2330:133");
    const rows = (await __qd_executePlan(query, __qd_registeredPlan("server.js:2332:134", [
    where, parseInt(lim) || 200]),
    params)).
    rows;
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
    const countRow = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2357:135"), []);
    const seq = (parseInt(countRow?.c || 0) + 1).toString().padStart(5, '0');
    const year = new Date().getFullYear();
    const voucher_number = `DPI-PV-${year}-${seq}`;
    await __qd_executePlan(query, __qd_registeredPlan("server.js:2362:136"),





    [id, voucher_number, payment_type, payee_name, payee_bank || null, payee_account || null,
    payee_branch_code || null, parseFloat(amount), currency || 'NAD', payment_method,
    reference_number || null, narration || null, authorised_by || null, prepared_by,
    status || 'draft', linked_request_id || null, linked_request_type || null,
    payment_date || null, notes || null]);

    const created = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2373:137"), [id]);
    let bonusReceipt = null;
    if (status === 'paid' && payment_type === 'bonus' && linked_request_id) {
      try {
        const bonus = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2377:138"), [linked_request_id]);
        if (bonus && bonus.status !== 'paid') {
          const payAmount = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
          if (payAmount > 0.01) {
            const payId = `BPAY-PV-${Date.now()}`;
            const paidDate = payment_date || new Date().toISOString().slice(0, 10);
            await __qd_executePlan(query, __qd_registeredPlan("server.js:2384:139"),


            [payId, linked_request_id, 'finance', payAmount, paidDate, prepared_by, `Paid via voucher ${voucher_number}`]);

            await __qd_executePlan(query, __qd_registeredPlan("server.js:2389:140"),

            [paidDate, linked_request_id]);

            bonusReceipt = { payment_id: payId, bonus_id: linked_request_id, amount: payAmount };
          }
        }
      } catch (bErr) {console.warn('Auto bonus payment failed:', bErr.message);}
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
      if (req.body[f] !== undefined) {params.push(req.body[f]);updates.push(__qd_registeredPlan("server.js:2415:141", [f, params.length]));}
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await __qd_executePlan(query, __qd_registeredPlan("server.js:2420:142", [__qd_joinPlans(
      updates, "comma"), params.length]),
    params);

    const updated = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2423:143"), [id]);
    let bonusReceipt = null;
    if (req.body.status === 'paid' && updated.payment_type === 'bonus' && updated.linked_request_id) {
      try {
        const bonus = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:2427:144"), [updated.linked_request_id]);
        if (bonus && bonus.status !== 'paid') {
          const payAmount = parseFloat(bonus.amount_earned) - parseFloat(bonus.amount_paid);
          if (payAmount > 0.01) {
            const preparedBy = req.user?.full_name || req.user?.username || 'Finance';
            const payId = `BPAY-PV-${Date.now()}`;
            const paidDate = updated.payment_date || new Date().toISOString().slice(0, 10);
            await __qd_executePlan(query, __qd_registeredPlan("server.js:2435:145"),


            [payId, updated.linked_request_id, 'finance', payAmount, paidDate, preparedBy, `Paid via voucher ${updated.voucher_number}`]);

            await __qd_executePlan(query, __qd_registeredPlan("server.js:2440:146"),

            [paidDate, updated.linked_request_id]);

            bonusReceipt = { payment_id: payId, bonus_id: updated.linked_request_id, amount: payAmount };
          }
        }
      } catch (bErr) {console.warn('Auto bonus payment failed (PATCH):', bErr.message);}
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
    await __qd_executePlan(query, __qd_registeredPlan("server.js:2460:147"), [req.params.id, 'draft']);
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
        error: 'Internal server error'
      });
    }
  }
});

app.use((await import('./api/services/publicAssetPolicy.js')).publicAssetBoundary);

const distPath = path.join(__dirname, 'dist');
const hasReactBuild = fs.existsSync(path.join(distPath, 'index.html'));

if (hasReactBuild) {
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (filePath.endsWith('sw.js')) {
        // The service worker filename never changes between builds (unlike
        // Vite's content-hashed assets), so it must never be cached long-term
        // or browsers will keep running a stale worker indefinitely and never
        // pick up new deploys.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
}

app.use((req, res, next) => {
  // Repository source, scripts, migrations and reports are not public assets.
  const safeRootFiles = new Set(['/favicon.ico', '/robots.txt', '/manifest.json']);
  const allowed = safeRootFiles.has(req.path) ||
  /^\/[a-zA-Z0-9_-]+\.html$/.test(req.path) ||
  /^\/(?:assets|images|fonts|css)\/[a-zA-Z0-9_./-]+$/.test(req.path);
  if (!allowed || req.path.split('/').some((p) => p === '..' || p.startsWith('.')))
  return next();
  return express.static(__dirname, {
    extensions: ['html', 'htm'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    }
  })(req, res, next);
});

app.use((req, res) => {
  if (hasReactBuild && !req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

if (startupPolicy.startupMode === 'code-only') {
  const { query } = await import('./api/db.js');
  const readiness = await checkStartupCompatibility(query, startupPolicy);
  setStartupReadiness(readiness);
  console.info(JSON.stringify({ event: 'startup.compatibility', ...readiness }));
}

const server = app.listen(PORT, HOST, () => {
  console.log('Dynapharm API & static server running');
  console.log(`Listening on http://${HOST}:${PORT}`);
  if (process.env.DATABASE_URL && startupPolicy.startupMode === 'legacy') {
    console.log('Database configuration present');
  } else if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set. Database-backed APIs may fail.');
  }
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

runStartupOperation(startupPolicy, 'legacy-database-bootstrap', async () => {
  try {
    const { query, getOne } = await import('./api/db.js');
    await __qd_executePlan(query, __qd_registeredPlan("server.js:2569:148"), []);
    console.log('Database connection verified');

    await __qd_executePlan(query, __qd_registeredPlan("server.js:2572:149"), []);






    // Authentication accounts are never created or reset by web bootstrap.

    // ── Branch ID normalization ─────────────────────────────────────────────
    // Canonical slug for every known display-name / alias variant.
    // Applied to branch_walkin_sales, stock_movements, branch_inventory_batches,
    // branch_inventory_movements, inventory_balances, and users.branch.
    const BRANCH_ALIAS_MAP = {
      'Windhoek CBD': 'townshop', 'windhoek cbd': 'townshop',
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
      'Country Stock': 'country_stock', 'country stock': 'country_stock'
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
      { table: 'reports', col: 'branch' }];

      for (const { table, col } of tables) {
        try {
          const r = await __qd_executePlan(query, __qd_registeredPlan("server.js:2626:150", [
          table, col, col]),
          [canonical, alias]);

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
    { id: 'oshakati_branch', name: 'Oshakati', region: 'Oshana' },
    { id: 'katima_mulilo', name: 'Katima Mulilo', region: 'Zambezi' }];

    for (const b of canonicalBranchRows) {
      try {
        await __qd_executePlan(query, __qd_registeredPlan("server.js:2649:151"),



        [b.id, b.name, b.region]);

      } catch (e) {
        console.warn(`[canonical branch insert] ${b.id}:`, e.message);
      }
    }

    // ── Normalize status values: legacy 'completed' → 'posted' ─────────────
    // All new movements use 'posted'. Old records used 'completed'. Align them.
    const statusFix = await __qd_executePlan(query, __qd_registeredPlan("server.js:2662:152"), []);


    if (statusFix && statusFix.rowCount > 0) {
      console.log(`Status normalization: updated ${statusFix.rowCount} stock_movements rows`);
    }

    // ── Schema sync: ensure columns added by later migrations exist ─────────
    // These ALTER TABLE … ADD COLUMN IF NOT EXISTS statements are idempotent.
    // They repair any production databases that were created before these
    // migrations were authored, without touching existing data.
    const schemaSyncs = [
    ...(process.env.REPLIT_DEPLOYMENT === '1' ? [] : [__qd_registeredPlan("server.js:2674:153")]), __qd_registeredPlan("server.js:2676:154"), __qd_registeredPlan("server.js:2677:155"), __qd_registeredPlan("server.js:2678:156"), __qd_registeredPlan("server.js:2679:157"), __qd_registeredPlan("server.js:2680:158"), __qd_registeredPlan("server.js:2681:159"), __qd_registeredPlan("server.js:2682:160"), __qd_registeredPlan("server.js:2684:161"),












    // Migration 019: GM dispatch approval columns on stock_transfers
    __qd_registeredPlan("server.js:2687:162"), __qd_registeredPlan("server.js:2688:163"), __qd_registeredPlan("server.js:2689:164"), __qd_registeredPlan("server.js:2690:165"), __qd_registeredPlan("server.js:2691:166"), __qd_registeredPlan("server.js:2692:167"),





    // Migration 020: CIF unit cost on stock_movements
    __qd_registeredPlan("server.js:2694:168"),
    // Campaigns extended schema
    __qd_registeredPlan("server.js:2696:169"), __qd_registeredPlan("server.js:2697:170"), __qd_registeredPlan("server.js:2698:171"), __qd_registeredPlan("server.js:2699:172"), __qd_registeredPlan("server.js:2700:173"), __qd_registeredPlan("server.js:2701:174"),





    // Distributor referral tracking on branch walk-in sales
    __qd_registeredPlan("server.js:2703:175"), __qd_registeredPlan("server.js:2704:176"),

    // Distributor profile photo persistence
    __qd_registeredPlan("server.js:2706:177"), __qd_registeredPlan("server.js:2707:178"), __qd_registeredPlan("server.js:2708:179"),


    // CAS: finance_cash_requests updated_at column (unblocks Finance PATCH)
    __qd_registeredPlan("server.js:2710:180"), __qd_registeredPlan("server.js:2711:181"), __qd_registeredPlan("server.js:2712:182"), __qd_registeredPlan("server.js:2713:183"), __qd_registeredPlan("server.js:2714:184"), __qd_registeredPlan("server.js:2715:185"), __qd_registeredPlan("server.js:2716:186"), __qd_registeredPlan("server.js:2717:187"), __qd_registeredPlan("server.js:2718:188"), __qd_registeredPlan("server.js:2719:189"), __qd_registeredPlan("server.js:2720:190"), __qd_registeredPlan("server.js:2721:191"), __qd_registeredPlan("server.js:2722:192"), __qd_registeredPlan("server.js:2723:193"), __qd_registeredPlan("server.js:2724:194"), __qd_registeredPlan("server.js:2725:195"), __qd_registeredPlan("server.js:2726:196"), __qd_registeredPlan("server.js:2727:197"), __qd_registeredPlan("server.js:2728:198"), __qd_registeredPlan("server.js:2729:199"), __qd_registeredPlan("server.js:2730:200"), __qd_registeredPlan("server.js:2731:201"), __qd_registeredPlan("server.js:2732:202"), __qd_registeredPlan("server.js:2733:203"), __qd_registeredPlan("server.js:2734:204"), __qd_registeredPlan("server.js:2735:205"), __qd_registeredPlan("server.js:2736:206"),


























    // file_uploads: description and category for training content
    __qd_registeredPlan("server.js:2738:207"), __qd_registeredPlan("server.js:2739:208"), __qd_registeredPlan("server.js:2740:209"),


    // field_program_requests: distributor info and signature fields
    __qd_registeredPlan("server.js:2742:210"), __qd_registeredPlan("server.js:2743:211"), __qd_registeredPlan("server.js:2744:212"), __qd_registeredPlan("server.js:2745:213"), __qd_registeredPlan("server.js:2746:214"), __qd_registeredPlan("server.js:2747:215"), __qd_registeredPlan("server.js:2748:216"),






    // Write-off disposal tracking: written-off stock stays in a disposal queue
    // until the stock manager physically disposes of it
    __qd_registeredPlan("server.js:2751:217"), __qd_registeredPlan("server.js:2752:218"), __qd_registeredPlan("server.js:2753:219"), __qd_registeredPlan("server.js:2754:220"),



    // Offline sync: idempotency keys to prevent duplicate submissions on reconnect
    __qd_registeredPlan("server.js:2756:221"), __qd_registeredPlan("server.js:2757:222"), __qd_registeredPlan("server.js:2758:223"), __qd_registeredPlan("server.js:2759:224"), __qd_registeredPlan("server.js:2760:225"), __qd_registeredPlan("server.js:2778:226"), __qd_registeredPlan("server.js:2779:227"),























    // charge_unit: what the patient is actually charged per unit (CP for non-members, DP for members)
    // Stored alongside unit_price (always DP / cost basis) so the correction script and reports
    // can distinguish company cost from patient revenue without re-joining product_prices.
    __qd_registeredPlan("server.js:2783:228"), __qd_registeredPlan("server.js:2784:229"),

    // stock_adjustments: GM-approval workflow for stock record corrections
    __qd_registeredPlan("server.js:2786:230"),




















    // Legacy column aliases (field_name was the old name before field_to_adjust)
    __qd_registeredPlan("server.js:2808:231"), __qd_registeredPlan("server.js:2809:232"), __qd_registeredPlan("server.js:2810:233"), __qd_registeredPlan("server.js:2811:234"), __qd_registeredPlan("server.js:2812:235"), __qd_registeredPlan("server.js:2813:236"), __qd_registeredPlan("server.js:2814:237"), __qd_registeredPlan("server.js:2815:238"), __qd_registeredPlan("server.js:2816:239"), __qd_registeredPlan("server.js:2817:240"),









    // Back-fill field_to_adjust from old field_name column — wrapped in DO block so it
    // silently succeeds even when the legacy field_name column never existed.
    __qd_registeredPlan("server.js:2820:241"),




    // Product codes and CIF breakdown columns
    __qd_registeredPlan("server.js:2826:242"), __qd_registeredPlan("server.js:2827:243"), __qd_registeredPlan("server.js:2828:244"), __qd_registeredPlan("server.js:2829:245"), __qd_registeredPlan("server.js:2830:246"), __qd_registeredPlan("server.js:2831:247"),





    // QR code field on stock_batches (separate from Code128 barcode)
    __qd_registeredPlan("server.js:2833:248"), __qd_registeredPlan("server.js:2834:249"),

    // ── Stock Automation tables ──────────────────────────────────────────────
    __qd_registeredPlan("server.js:2836:250"), __qd_registeredPlan("server.js:2842:251"), __qd_registeredPlan("server.js:2854:252"), __qd_registeredPlan("server.js:2865:253"), __qd_registeredPlan("server.js:2866:254"),






























    // ── #10 Batch traceability: link branch batches back to source stock_batch ──
    __qd_registeredPlan("server.js:2868:255"),
    // ── #4 Short-delivery discrepancy records ────────────────────────────────
    __qd_registeredPlan("server.js:2870:256"), __qd_registeredPlan("server.js:2886:257"), __qd_registeredPlan("server.js:2887:258"), __qd_registeredPlan("server.js:2888:259"),


















    // ── #73 Prevent negative stock at database level ──────────────────────────
    // These constraints serve as the last line of defence after application-layer guards.
    // PostgreSQL does not support "ADD CONSTRAINT IF NOT EXISTS" — use DO blocks instead.
    __qd_registeredPlan("server.js:2892:260"), __qd_registeredPlan("server.js:2893:261"), __qd_registeredPlan("server.js:2894:262"), __qd_registeredPlan("server.js:2895:263"),



    // ── priority column on stock_transfers (used by escalation scheduler) ────
    __qd_registeredPlan("server.js:2897:264"),
    // ── Extended HR profile fields on users ──────────────────────────────────
    __qd_registeredPlan("server.js:2899:265"), __qd_registeredPlan("server.js:2900:266"), __qd_registeredPlan("server.js:2901:267"), __qd_registeredPlan("server.js:2902:268"), __qd_registeredPlan("server.js:2903:269"), __qd_registeredPlan("server.js:2904:270"), __qd_registeredPlan("server.js:2905:271"), __qd_registeredPlan("server.js:2906:272"),







    // ── Extended personal / qualification fields on users ─────────────────────
    __qd_registeredPlan("server.js:2908:273"), __qd_registeredPlan("server.js:2909:274"), __qd_registeredPlan("server.js:2910:275"), __qd_registeredPlan("server.js:2911:276"), __qd_registeredPlan("server.js:2912:277"), __qd_registeredPlan("server.js:2913:278"), __qd_registeredPlan("server.js:2914:279"), __qd_registeredPlan("server.js:2915:280"), __qd_registeredPlan("server.js:2916:281"), __qd_registeredPlan("server.js:2917:282"), __qd_registeredPlan("server.js:2918:283"),










    // ── staff_documents table ─────────────────────────────────────────────────
    __qd_registeredPlan("server.js:2920:284"), __qd_registeredPlan("server.js:2930:285"),










    // ── profile_update support in hr_staff_change_requests ───────────────────
    __qd_registeredPlan("server.js:2932:286"), __qd_registeredPlan("server.js:2933:287")];


    let schemaSynced = 0;
    for (const sql of schemaSyncs) {
      try {await __qd_executePlan(query, sql, []);schemaSynced++;} catch {}
    }
    if (schemaSynced > 0) {
      console.log(`Schema sync: applied ${schemaSynced} column additions`);
    }
    const { ensureControlledStockSchema } = await import('./api/services/controlledStock.js');
    await ensureControlledStockSchema();
    // ────────────────────────────────────────────────────────────────────────

    // ── Seed default stock automation config (idempotent ON CONFLICT DO NOTHING) ──
    try {
      const defaultAutomationConfig = [
      ['auto_writeoff_enabled', 'true', 'Enable nightly auto write-off submission for expired batches'],
      ['auto_stock_request_enabled', 'true', 'Enable auto stock requests when branch stock falls below minimum'],
      ['auto_receive_enabled', 'true', 'Enable auto-receive for dispatches idle longer than threshold hours'],
      ['auto_receive_hours', '24', 'Hours before a dispatched transfer is auto-received'],
      ['small_transfer_auto_approve', 'true', 'Enable auto-dispatch for small transfers at or below the threshold'],
      ['small_transfer_threshold', '5', 'Max total units for a transfer to qualify for auto-dispatch (skip GM)'],
      ['stock_request_min_qty', '5', 'Global minimum stock qty before auto stock request is raised'],
      ['stock_request_reorder_qty', '20', 'Global default reorder quantity per product in auto stock requests'],
      ['preferred_warehouse', 'windhoek_warehouse', 'Default warehouse for auto-generated stock requests'],
      // ── New automation config keys ────────────────────────────────────────────
      ['stuck_approval_enabled', 'true', 'Enable stuck-approval cleanup alerts for approved transfers not dispatched'],
      ['stuck_approval_hours', '8', 'Hours an approved transfer can sit undispatched before alert is triggered'],
      ['stuck_approval_auto_revert', 'false', 'Auto-revert stuck approved transfers to pending_approval (restores stock)'],
      ['pending_escalation_enabled', 'true', 'Enable escalation notifications for transfers awaiting GM approval too long'],
      ['pending_escalation_hours', '4', 'Hours before pending-approval transfer triggers escalation alert to GM'],
      ['drift_repair_enabled', 'true', 'Enable nightly inventory balance drift repair between cache and stock_movements'],
      ['drift_tolerance_units', '1', 'Units of difference allowed before drift repair recomputes a location'],
      ['warehouse_reorder_enabled', 'true', 'Enable auto-reorder requests when warehouse stock falls below minimum'],
      ['warehouse_min_qty', '20', 'Warehouse minimum qty below which a reorder request is auto-raised'],
      ['warehouse_reorder_qty', '50', 'Default reorder quantity for warehouse reorder requests from country stock'],
      ['inter_branch_redistrib_enabled', 'true', 'Enable inter-branch surplus redistribution suggestions sent to GM'],
      ['inter_branch_surplus_ratio', '2', 'Branch is surplus when its qty > avgQty * this ratio'],
      ['health_digest_enabled', 'true', 'Enable nightly stock health digest sent to GM and stock manager at 06:00']];

      for (const [key, value, description] of defaultAutomationConfig) {
        await __qd_executePlan(query, __qd_registeredPlan("server.js:2975:288"),



        [key, value, description]);

      }
      console.log('[automation] Default automation config seeded');
    } catch (acErr) {
      console.warn('[automation] Config seed warning:', acErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Campaign participation and winners tables ─────────────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:2989:289"), []);














      await __qd_executePlan(query, __qd_registeredPlan("server.js:3004:290"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3005:291"), []);

      await __qd_executePlan(query, __qd_registeredPlan("server.js:3007:292"), []);















      await __qd_executePlan(query, __qd_registeredPlan("server.js:3023:293"), []);
    } catch (e) {
      console.warn('[campaign tables init]', e.message);
    }

    // ── Petty cash tables ────────────────────────────────────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3030:294"), []);










      await __qd_executePlan(query, __qd_registeredPlan("server.js:3041:295"), []);



















      await __qd_executePlan(query, __qd_registeredPlan("server.js:3061:296"), []);













      await __qd_executePlan(query, __qd_registeredPlan("server.js:3075:297"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3076:298"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3077:299"), []);
    } catch (e) {
      console.warn('[petty cash tables init]', e.message);
    }
    // ── Distributor bonus tables ──────────────────────────────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3083:300"), []);
















      await __qd_executePlan(query, __qd_registeredPlan("server.js:3100:301"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3101:302"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3102:303"), []);











      await __qd_executePlan(query, __qd_registeredPlan("server.js:3114:304"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3115:305"), []);
    } catch (e) {
      console.warn('[distributor bonus tables init]', e.message);
    }
    // ── Supplier Purchase Orders ──────────────────────────────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3121:306"), []);



















      await __qd_executePlan(query, __qd_registeredPlan("server.js:3141:307"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3142:308"), []);
    } catch (e) {
      console.warn('[supplier_purchase_orders init]', e.message);
    }
    // ── Payment Vouchers ──────────────────────────────────────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3148:309"), []);
























      await __qd_executePlan(query, __qd_registeredPlan("server.js:3173:310"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3174:311"), []);
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3175:312"), []);
    } catch (e) {
      console.warn('[payment_vouchers init]', e.message);
    }
    // ── Distributor Bonus Statements (monthly upload by admin/GM/MIS) ─────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3181:313"), []);











      await __qd_executePlan(query, __qd_registeredPlan("server.js:3193:314"), []);
    } catch (e) {
      console.warn('[distributor_statements init]', e.message);
    }
    // ── System-wide admin settings (key/value store) ──────────────────────
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3199:315"), []);






    } catch (e) {
      console.warn('[system_settings init]', e.message);
    }
    // ── Receipt number counters (guaranteed unique sequential per branch/year) ──
    try {
      await __qd_executePlan(query, __qd_registeredPlan("server.js:3211:316"), []);







    } catch (e) {
      console.warn('[receipt_counters init]', e.message);
    }
    // ────────────────────────────────────────────────────────────────────────
    // ── Normalize appointment branch display names → branch IDs (idempotent) ──
    try {
      const aptNorm = await __qd_executePlan(query, __qd_registeredPlan("server.js:3226:317"), []);






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
        'Outapi': 'outapi', 'outapi': 'outapi'
      };
      const bfResult = await __qd_executePlan(query, __qd_registeredPlan("server.js:3260:318"), []);





      const nullBranchReports = bfResult?.rows || [];
      let backfilled = 0;
      for (const row of nullBranchReports) {
        const branchId = branchNameToId[row.apt_branch] || row.apt_branch;
        if (branchId) {
          await __qd_executePlan(query, __qd_registeredPlan("server.js:3270:319"), [branchId, row.id]);
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
        'Outapi': 'outapi', 'outapi': 'outapi'
      };
      const canonicalIds = new Set(Object.values(branchNameToId));
      // Fetch all reports whose branch is NOT already a canonical ID
      const { rows: nonCanonical } = await __qd_executePlan(query, __qd_registeredPlan("server.js:3303:320"), []);


      let normalised = 0;
      for (const row of nonCanonical) {
        if (canonicalIds.has(row.branch)) continue; // already correct
        const mapped = branchNameToId[row.branch] || branchNameToId[(row.branch || '').toLowerCase()];
        if (mapped && mapped !== row.branch) {
          await __qd_executePlan(query, __qd_registeredPlan("server.js:3310:321"), [mapped, row.id]);
          normalised++;
        }
      }
      if (normalised > 0) console.log(`Reports branch normalisation: fixed ${normalised} display-name records`);
    } catch (e) {
      console.warn('[reports branch normalise]', e.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Auto-seed inventory_balances if empty ───────────────────────────────
    const ibCount = await __qd_executePlan(getOne, __qd_registeredPlan("server.js:3321:322"), []);
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

    // Historical corrections require reviewed evidence and separate approval.
    // Preserve the legacy routines for audit, but never run them on startup.
    const runLegacyStockRepairs = false;
    if (runLegacyStockRepairs) {
      // ── Mark all NULL-status stock_movements as 'posted' ────────────────────
      // Historical records created before the status field was enforced have
      // status = NULL.  The stockEngine only counts 'posted' movements, so
      // these must be promoted before any balance recompute.
      try {
        const nullMovFix = await __qd_executePlan(query, __qd_registeredPlan("server.js:3343:323"), []);



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
        const restoreResult = await __qd_executePlan(query, __qd_registeredPlan("server.js:3360:324"), []);























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
        const reconResult = await __qd_executePlan(query, __qd_registeredPlan("server.js:3399:325"), []);































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
        const dedupIB = await __qd_executePlan(query, __qd_registeredPlan("server.js:3444:326"), []);












        if (dedupIB && dedupIB.rowCount > 0) {
          console.log(`[startup] Removed ${dedupIB.rowCount} duplicate inventory_balances row(s)`);
        }
        // Remove stale non-branch rows with negative / zero closing_qty
        // (country_stock and warehouse balances are tracked via stock_batches, not here)
        const cleanNeg = await __qd_executePlan(query, __qd_registeredPlan("server.js:3462:327"), []);




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
        const bfBatch = await __qd_executePlan(query, __qd_registeredPlan("server.js:3481:328"), []);

































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
        const dedupBIB = await __qd_executePlan(query, __qd_registeredPlan("server.js:3527:329"), []);











        if (dedupBIB && dedupBIB.rowCount > 0) {
          console.log(`[startup] Removed ${dedupBIB.rowCount} duplicate branch_inventory_batches row(s)`);
        }
      } catch (dedupBIBErr) {
        console.warn('[startup branch_inventory_batches dedup]', dedupBIBErr.message);
      }
      // ────────────────────────────────────────────────────────────────────────

      // ── Clean up NULL-expiry ghost rows created by pre-fix refund approvals ──
      try {
        const { runRefundGhostCleanup } = await import('./api/services/refundGhostCleanup.js');
        await runRefundGhostCleanup();
      } catch (ghostCleanupErr) {
        console.warn('[refund-ghost-cleanup] Migration failed:', ghostCleanupErr.message);
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
        const bulkMark = await __qd_executePlan(query, __qd_registeredPlan("server.js:3569:330"), []).





        catch(() => null);
        if (bulkMark && bulkMark.rowCount > 0) {
          console.log(`[write-off backfill] Marked ${bulkMark.rowCount} historical returned write-offs as warehouse_stock_credited (one-time migration)`);
        }

        const woReturns = await __qd_executePlan(query, __qd_registeredPlan("server.js:3580:331"), []);











        let woBackfilled = 0;
        for (const wo of woReturns?.rows || []) {
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
              await __qd_executePlan(query, __qd_registeredPlan("server.js:3604:332"),

              [wo.id]).
              catch(() => {});
              continue;
            }
            const batchNo = wo.batch_no || '';

            // Try to increment an existing batch first
            const sbUpd = await __qd_executePlan(query, __qd_registeredPlan("server.js:3613:333"),







            [qty, warehouseId, wo.product_name, batchNo]);

            if (sbUpd && sbUpd.rowCount > 0) {
              woBackfilled++;
            } else {
              // No existing row — create a new stock_batches entry
              const sbId = `SB-WO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
              const cif = Number(wo.unit_cif || 0);
              const dpc = Number(wo.unit_dp || 0);
              await __qd_executePlan(query, __qd_registeredPlan("server.js:3630:334"),






              [sbId, wo.product_name, batchNo || null, wo.expiry_date || null, qty,
              warehouseId, cif, dpc, qty * cif, qty * dpc]);

              woBackfilled++;
            }
            // Mark this movement as fully processed — prevents re-crediting on every subsequent restart.
            // The backfill query's WHERE clause filters on disposal_status = 'returned_to_warehouse',
            // so setting it to 'warehouse_stock_credited' here makes this operation idempotent.
            await __qd_executePlan(query, __qd_registeredPlan("server.js:3645:335"),

            [wo.id]).
            catch(() => {});
          } catch (_) {}
        }
        if (woBackfilled > 0) {
          console.log(`[write-off backfill] Credited ${woBackfilled} returned-to-warehouse item(s) into stock_batches`);
        }
      } catch (woErr) {
        console.warn('[write-off backfill]', woErr.message);
      }
      // ───────────────────────────────────────────────────────────────────────

      // Historical sales and movement prices are immutable during application startup.
      // Evidence-backed historical corrections require a separately approved repair.
      // ─────────────────────────────────────────────────────────────────────────

      // ── Backfill source_warehouse on branch_inventory_batches ────────────────
      // receive-request.js previously omitted source_warehouse from the INSERT.
      // Recover it from the matching stock_movements (branch_receipt) record.
      try {
        const bfSw = await __qd_executePlan(query, __qd_registeredPlan("server.js:3666:336"), []);
















        if (bfSw.rowCount > 0)
        console.log(`[data-correction] Backfilled source_warehouse on ${bfSw.rowCount} branch_inventory_batches row(s).`);
      } catch (swErr) {
        console.warn('[data-correction] source_warehouse backfill error:', swErr.message);
      }
      // ─────────────────────────────────────────────────────────────────────────

      // ── Heal delivered/received transfers missing their inward movements ─────
      // Root cause: transfers.js UPDATE stock_transfers (line ~1108) runs BEFORE
      // withTransaction.  If withTransaction errors (network blip, constraint
      // violation, server restart mid-flight), the status row is permanently
      // 'delivered'/'received' but no transfer_in movement or BIB row was written.
      // This correction detects those gaps, backfills branch_inventory_batches and
      // stock_movements, then recomputes inventory_balances for the affected branch.
      try {
        const gapQuery = await __qd_executePlan(query, __qd_registeredPlan("server.js:3698:337"), []);




















        const { normalizeBranchSlug } = await import('./api/_lib/branchUtils.js');
        const { withTransaction } = await import('./api/db.js');
        const { recomputeLocationBalances } = await import('./api/services/stockEngine.js');

        let healed = 0;
        for (const gap of gapQuery?.rows || []) {
          try {
            const branchId = normalizeBranchSlug(gap.to_branch) || gap.to_branch;
            const srcWarehouse = gap.from_warehouse || null;
            const items = Array.isArray(gap.items) ? gap.items : [];
            if (!branchId || items.length === 0) continue;

            await withTransaction(async (client) => {
              for (const item of items) {
                const productName = (item.product || '').trim();
                const batchNo = item.batch_no || null;
                const expiryDate = item.expiry || null;
                const qty = Number(item.qty || 0);
                if (!productName || qty <= 0) continue;

                // BIB: upsert so a double-heal is idempotent
                const bibId = `BIB-HEAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                if (batchNo && expiryDate) {
                  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3743:338"),









                  [bibId, branchId, productName, batchNo, expiryDate, qty, srcWarehouse]);

                } else {
                  const ex = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3756:339"),





                  [branchId, productName, batchNo, expiryDate])).
                  rows;
                  if (ex.length > 0) {
                    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3765:340"),

                    [qty, ex[0].id]);

                  } else {
                    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3770:341"),




                    [bibId, branchId, productName, batchNo, expiryDate, qty, srcWarehouse]);

                  }
                }

                // stock_movements: idempotent — only insert if truly missing
                const smExists = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3781:342"),



                [gap.id, productName])).
                rowCount;
                if (!smExists) {
                  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("server.js:3788:343"),








                  [
                  `MOV-HEAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                  productName, batchNo, expiryDate, qty,
                  srcWarehouse, branchId, gap.id]);


                }
              }
            });

            recomputeLocationBalances('branch', branchId).catch(() => {});
            if (srcWarehouse) recomputeLocationBalances('warehouse', srcWarehouse).catch(() => {});
            healed++;
            console.log(`[transfer-heal] Backfilled missing inward movement/BIB for transfer ${gap.id} → ${branchId}`);
          } catch (healItemErr) {
            console.warn(`[transfer-heal] Could not heal transfer ${gap.id}:`, healItemErr.message);
          }
        }
        if (healed === 0 && gapQuery?.rows?.length === 0) {

          // Silently pass — no gaps found
        } else if (healed > 0) {console.log(`[transfer-heal] Healed ${healed} transfer(s) missing inward movement.`);
        }
      } catch (healErr) {
        console.warn('[transfer-heal] Startup heal failed:', healErr.message);
      }
      // ─────────────────────────────────────────────────────────────────────────

    }
    console.log('[stock-safety] Automatic historical stock repairs are disabled.');

    // ── Start automated stock reporting scheduler ────────────────────────────
    try {
      const { startStockScheduler, ensureStockSummaryTable } = await import('./api/services/stockScheduler.js');
      await ensureStockSummaryTable();
      startStockScheduler();
    } catch (schedErr) {
      console.warn('Stock scheduler startup warning:', schedErr.message);
    }
    // ───────────────────────────────────────────────────────────────────────

    // Staff provisioning is an explicitly authorized administrative operation.
    // Apply any pending price changes now that schema is fully up to date
    await applyPendingPriceChanges();
  } catch (error) {
    console.warn('Database startup check failed:', error.message);
  }
});

export { server };
