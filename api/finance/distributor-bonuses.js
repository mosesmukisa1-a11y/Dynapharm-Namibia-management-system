import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FINANCE_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

async function ensureTables() {
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
}

function parseExcelFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows;
}

function normalizeRow(row) {
  const getValue = (...candidates) => {
    for (const c of candidates) {
      const found = Object.entries(row).find(([k]) => k.toLowerCase().trim() === c.toLowerCase());
      if (found && found[1] !== '' && found[1] != null) return String(found[1]).trim();
    }
    return '';
  };

  const nbNumber = getValue('nb number', 'nb_number', 'nbnumber', 'drn', 'distributor_code', 'code').toUpperCase();
  const name = getValue('distributor name', 'distributor_name', 'name', 'full_name');
  const amount = parseFloat(getValue('amount', 'bonus', 'bonus_amount')) || 0;
  const period = getValue('period', 'month', 'period_month');

  if (!nbNumber || !name || amount <= 0) return null;
  return { nb_number: nbNumber, distributor_name: name, amount_earned: amount, period };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  if (!FINANCE_ROLES.has(role)) {
    return res.status(403).json({ success: false, error: 'Finance access required' });
  }

  try {
    await ensureTables();

    if (req.method === 'POST' && req.url.includes('/upload')) {
      return handleUpload(req, res);
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const nb = url.searchParams.get('nb') || url.searchParams.get('nb_number') || '';
      const period = url.searchParams.get('period') || '';
      const status = url.searchParams.get('status') || '';
      const includePayments = url.searchParams.get('include_payments') === 'true';

      const params = [];
      const where = [];

      if (nb) {
        params.push(`%${nb}%`);
        where.push(`(b.nb_number ILIKE $${params.length} OR b.distributor_name ILIKE $${params.length})`);
      }

      if (period) {
        params.push(period);
        where.push(`b.period = $${params.length}`);
      }

      if (status) {
        params.push(status);
        where.push(`b.status = $${params.length}`);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const bonuses = await getMany(
        `SELECT b.* FROM distributor_bonuses b ${whereClause} ORDER BY b.period DESC, b.distributor_name`,
        params
      );

      if (includePayments && bonuses.length > 0) {
        const bonusIds = bonuses.map(b => b.id);
        const payments = await getMany(
          `SELECT * FROM distributor_bonus_payments WHERE bonus_id = ANY($1) ORDER BY paid_at DESC`,
          [bonusIds]
        );
        const payMap = {};
        for (const p of payments) {
          if (!payMap[p.bonus_id]) payMap[p.bonus_id] = [];
          payMap[p.bonus_id].push(p);
        }
        bonuses.forEach(b => { b.payments = payMap[b.id] || []; });
      }

      return res.json({ success: true, bonuses, total: bonuses.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/distributor-bonuses]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function handleUpload(req, res) {
  return new Promise((resolve) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return resolve();
      }
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return resolve();
      }

      try {
        const rows = parseExcelFile(req.file.buffer);
        const parsed = rows.map(normalizeRow).filter(Boolean);

        if (parsed.length === 0) {
          res.status(400).json({ success: false, error: 'No valid rows found. Expected columns: NB Number, Distributor Name, Amount, Period' });
          return resolve();
        }

        if (parsed.length > 0) {
          const nbNumbers = [...new Set(parsed.map(r => r.nb_number))];
          const existingDistributors = await getMany(
            `SELECT nb_number, id FROM users WHERE nb_number = ANY($1) OR username = ANY($1)`,
            [nbNumbers]
          ).catch(() => []);
          const distMap = {};
          for (const d of existingDistributors) {
            distMap[d.nb_number?.toUpperCase()] = d.id;
          }
          for (const r of parsed) {
            r.distributor_id = distMap[r.nb_number] || null;
          }
        }

        res.json({ success: true, rows: parsed, count: parsed.length });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message });
      }
      resolve();
    });
  });
}
