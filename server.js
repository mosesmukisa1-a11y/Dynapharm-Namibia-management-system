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

const PUBLIC_API_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/distributor-login',
  '/api/distributors/set-password',
  '/api/distributors/forgot-password',
  '/api/health',
]);

const PUBLIC_POST_ROUTES = new Set([
  '/api/orders',
  '/api/delivery',
  '/api/appointments',
  '/api/collect',
  '/api/realtime_publish',
  '/api/field_program_requests',
  '/api/send-email',
  '/api/distributor-agreement',
]);

const PUBLIC_GET_ROUTES = new Set([
  '/api/products',
  '/api/branches',
  '/api/product_images',
  '/api/distributors',
  '/api/notifications',
  '/api/media',
  '/api/stock-movements',
]);

const PUBLIC_PUT_ROUTES = new Set([
  '/api/notifications',
]);

app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  const routePath = req.baseUrl + req.path.replace(/\/$/, '');
  const isPublic = PUBLIC_API_ROUTES.has(routePath) ||
    (req.method === 'GET' && PUBLIC_GET_ROUTES.has(routePath)) ||
    (req.method === 'POST' && PUBLIC_POST_ROUTES.has(routePath)) ||
    (req.method === 'PUT' && PUBLIC_PUT_ROUTES.has(routePath));

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
