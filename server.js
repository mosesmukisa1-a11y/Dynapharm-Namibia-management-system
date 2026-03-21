import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const HOST = process.env.HOST || '0.0.0.0';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  '/api/stock/transfers',
  '/api/branch/',
  '/api/leave-requests',
  '/api/cash-requests',
  '/api/mis/',
  '/api/admin/',
  '/api/upload',
  '/api/field_program_requests',
  '/api/campaigns',
  '/api/products',
  '/api/branches',
  '/api/product_images',
  '/api/notifications',
  '/api/media',
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

async function getHandler(pathname) {
  const normalized = normalizeApiPath(pathname);
  if (!normalized) {
    return null;
  }
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
    console.error(`Failed to load API handler for ${pathname}:`, error);
    throw error;
  }

  handlerCache.set(normalized, null);
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

const _leaveRequests = [];
const _cashRequests = [];

app.get('/api/leave-requests', (req, res) => {
  const username = (req.user?.sub || req.user?.username || '').toLowerCase();
  const mine = _leaveRequests.filter(r => (r.staff || '').toLowerCase() === username);
  res.json(mine);
});

app.post('/api/leave-requests', (req, res) => {
  const username = (req.user?.sub || req.user?.username || '').toLowerCase();
  const { type, startDate, endDate, reason, urgent } = req.body;
  if (!type || !startDate || !endDate || !reason) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  _leaveRequests.push({
    id: Date.now(),
    staff: username,
    staffName: req.user?.name || username,
    type,
    startDate,
    endDate,
    reason,
    urgent: !!urgent,
    status: 'Pending',
    submittedAt: new Date().toISOString(),
  });
  res.json({ success: true });
});

app.get('/api/cash-requests', (req, res) => {
  const username = (req.user?.sub || req.user?.username || '').toLowerCase();
  const mine = _cashRequests.filter(r => (r.staff || '').toLowerCase() === username);
  res.json(mine);
});

app.post('/api/cash-requests', (req, res) => {
  const username = (req.user?.sub || req.user?.username || '').toLowerCase();
  const { amount, purpose, urgent } = req.body;
  if (!amount || !purpose) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  _cashRequests.push({
    id: Date.now(),
    staff: username,
    staffName: req.user?.name || username,
    amount: String(amount),
    purpose,
    urgent: !!urgent,
    status: 'Pending',
    submittedAt: new Date().toISOString(),
  });
  res.json({ success: true });
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
             ('ondangwa_warehouse', 'Ondangwa Warehouse', 'OND', 'warehouse', 'active', NOW(), NOW())
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

    const staffUsers = [
      { id: 'USR1759829667953', username: 'moses', password: 'walker33', fullName: 'MOSES MUKISA', email: 'mosesmukisa1@gmail.com', phone: '0817317160', role: 'consultant', branch: 'townshop' },
      { id: 'USR1759829814781', username: 'Geneva', password: 'Pearl_11', fullName: 'Jennifer Joseph', email: 'shange1124@gmail.com', phone: '0852803618', role: 'consultant', branch: 'townshop' },
      { id: 'USR1759830625722', username: 'NAEM', password: 'PASSWORD', fullName: 'NAEM HANGULA', email: 'naemhangula4@gmail.com', phone: '0817499757', role: 'dispenser', branch: 'townshop' },
      { id: 'USR1759928153488', username: 'GEINGOS', password: 'ALBERTO99', fullName: 'HILMA C', email: 'geingoshilma@gmail', phone: '0814137106', role: 'consultant', branch: 'townshop' }
    ];
    const bcryptMod = await import('bcryptjs');
    for (const u of staffUsers) {
      const exists = await getOne("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [u.username]);
      if (!exists) {
        const pwHash = await bcryptMod.default.hash(u.password, 10);
        await query(
          `INSERT INTO users (id, username, password_hash, role, full_name, email, phone, branch, is_active, must_change_password, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, FALSE, '{"seeded":true}'::jsonb, NOW(), NOW())
           ON CONFLICT (username) DO NOTHING`,
          [u.id, u.username, pwHash, u.role, u.fullName, u.email, u.phone, u.branch]
        );
        console.log('Seeded staff user:', u.username, '(' + u.role + ')');
      }
    }
  } catch (error) {
    console.warn('Database startup check failed:', error.message);
  }
})();
