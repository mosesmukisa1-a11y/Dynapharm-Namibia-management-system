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
  await query(`
    CREATE TABLE IF NOT EXISTS bonus_period_delete_requests (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      total_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
      reason TEXT,
      requested_by TEXT NOT NULL,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending_gm',
      gm_actioned_by TEXT,
      gm_actioned_at TIMESTAMPTZ,
      gm_notes TEXT
    )
  `);
}

function parseExcelFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows;
}

/**
 * Parse Namibian/Philippine-style number: "2 565,80" → 2565.80
 * Handles space thousands separator + comma decimal separator.
 */
function parseNamibianAmount(str) {
  if (str == null || str === '') return 0;
  const s = String(str)
    .replace(/['"]/g, '')  // strip quotes
    .trim()
    .replace(/\s/g, '')    // remove spaces (thousands separator)
    .replace(',', '.');    // comma → dot for decimal
  return parseFloat(s) || 0;
}

/**
 * Parse the Dynapharm bonus CSV format.
 * Skips header rows (company name, report date, area) and finds the actual
 * column header row by looking for DRN or NB/NAME keywords.
 * Handles comma and semicolon delimiters.
 */
function parseDynapharmCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Find the column header row; detect delimiter (pipe, semicolon, comma)
  let headerIdx = -1;
  let delimiter = ',';
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes('DRN') || (upper.includes('NB') && upper.includes('NAME')) || upper.includes('NAD')) {
      headerIdx = i;
      if (upper.includes('|')) delimiter = '|';
      else if (upper.includes(';')) delimiter = ';';
      else delimiter = ',';
      break;
    }
  }

  if (headerIdx === -1) return null; // couldn't find header — fall back to XLSX

  // Parse a single CSV line (handles quoted fields)
  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delimiter && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[headerIdx]).map(h =>
    h.replace(/['"]/g, '').toLowerCase().trim()
  );

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.every(v => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
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

  const nbNumber = getValue('drn', 'nb number', 'nb_number', 'nbnumber', 'distributor_code', 'code').toUpperCase();
  const name = getValue('name', 'distributor name', 'distributor_name', 'full_name');
  // NAD column uses European format — must use parseNamibianAmount
  const rawAmount = getValue('nad', 'amount', 'bonus', 'bonus_amount', 'amount earned');
  const amount = parseNamibianAmount(rawAmount);
  const period = getValue('period', 'month', 'period_month');
  const area = getValue('area', 'zone', 'region') || '';
  const stockist = getValue('stockist', 'type', 'category') || '';

  if (!nbNumber || !name || amount <= 0) return null;
  return { nb_number: nbNumber, distributor_name: name, amount_earned: amount, period, area, stockist };
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

    /* ── DELETE REQUEST: Finance submits a period-deletion request ── */
    if (req.method === 'POST' && req.url.includes('/delete-request')) {
      const { period, reason } = req.body || {};
      if (!period) return res.status(400).json({ success: false, error: 'period is required' });

      const existing = await getOne(
        `SELECT id FROM bonus_period_delete_requests WHERE period = $1 AND status = 'pending_gm'`,
        [period]
      );
      if (existing) {
        return res.status(409).json({ success: false, error: `A deletion request for period ${period} is already pending GM approval.` });
      }

      const agg = await getOne(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_earned), 0) AS total FROM distributor_bonuses WHERE period = $1`,
        [period]
      );
      const recordCount = parseInt(agg?.cnt || 0);
      if (recordCount === 0) {
        return res.status(404).json({ success: false, error: `No bonus records found for period ${period}.` });
      }

      const id = `bdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await query(
        `INSERT INTO bonus_period_delete_requests (id, period, record_count, total_earned, reason, requested_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_gm')`,
        [id, period, recordCount, parseFloat(agg.total || 0), reason || null,
         req.user.full_name || req.user.username || req.user.id]
      );

      return res.json({
        success: true,
        message: `Deletion request for period ${period} submitted. Awaiting GM approval.`,
        requestId: id,
        recordCount,
        totalEarned: parseFloat(agg.total || 0),
      });
    }

    /* ── DELETE REQUEST LIST: Get pending/all delete requests ── */
    if (req.method === 'GET' && req.url.includes('/delete-requests')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const statusFilter = url.searchParams.get('status') || 'pending_gm';
      const rows = await getMany(
        `SELECT * FROM bonus_period_delete_requests WHERE status = $1 ORDER BY requested_at DESC`,
        [statusFilter]
      );
      return res.json({ success: true, requests: rows });
    }

    /* ── DELETE REQUEST ACTION: GM approves or rejects ── */
    if (req.method === 'PUT' && req.url.includes('/delete-request/')) {
      const gmRoles = new Set(['admin', 'gm', 'director']);
      if (!gmRoles.has(req.user.role || '')) {
        return res.status(403).json({ success: false, error: 'GM access required to action delete requests.' });
      }

      const urlParts = req.url.split('/');
      const reqId = urlParts[urlParts.length - 1].split('?')[0];
      const { action, gm_notes } = req.body || {};

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: "action must be 'approve' or 'reject'" });
      }

      const deleteReq = await getOne(`SELECT * FROM bonus_period_delete_requests WHERE id = $1`, [reqId]);
      if (!deleteReq) return res.status(404).json({ success: false, error: 'Delete request not found.' });
      if (deleteReq.status !== 'pending_gm') {
        return res.status(409).json({ success: false, error: `Request is already ${deleteReq.status}.` });
      }

      const gmName = req.user.full_name || req.user.username || req.user.id;
      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      await query(
        `UPDATE bonus_period_delete_requests
         SET status = $1, gm_actioned_by = $2, gm_actioned_at = NOW(), gm_notes = $3
         WHERE id = $4`,
        [newStatus, gmName, gm_notes || null, reqId]
      );

      if (action === 'approve') {
        await query(`DELETE FROM distributor_bonuses WHERE period = $1`, [deleteReq.period]);
      }

      return res.json({
        success: true,
        message: action === 'approve'
          ? `Period ${deleteReq.period} bonus records deleted (${deleteReq.record_count} records removed).`
          : `Deletion request for period ${deleteReq.period} rejected.`,
        action,
        period: deleteReq.period,
      });
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
        const fileName = (req.file.originalname || '').toLowerCase();
        const isCsv = fileName.endsWith('.csv') || req.file.mimetype === 'text/csv' || req.file.mimetype === 'application/csv';

        let rows;
        if (isCsv) {
          // Try Dynapharm CSV format first (has header rows, DRN/NAD columns, European amounts)
          const text = req.file.buffer.toString('utf8');
          const csvRows = parseDynapharmCSV(text);
          if (csvRows) {
            rows = csvRows;
          } else {
            // Fall back: parse CSV through XLSX
            const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          }
        } else {
          rows = parseExcelFile(req.file.buffer);
        }

        const parsed = rows.map(normalizeRow).filter(Boolean);

        if (parsed.length === 0) {
          res.status(400).json({ success: false, error: 'No valid rows found. Supported format: DRN, NAME, STOCKIST, AREA, NAD columns (Dynapharm CSV format), or NB Number, Distributor Name, Amount columns (Excel format).' });
          return resolve();
        }

        if (parsed.length > 0) {
          const nbNumbers = [...new Set(parsed.map(r => r.nb_number))];
          const existingDistributors = await getMany(
            `SELECT distributor_code AS nb_number, id FROM distributors WHERE distributor_code = ANY($1)`,
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
