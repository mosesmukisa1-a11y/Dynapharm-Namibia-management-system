import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FINANCE_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

async function ensureTables() {
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:11:0"), []);
















  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:28:1"), []);
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:29:2"), []);
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:30:3"), []);











  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:42:4"), []);
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:43:5"), []);
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:44:6"), []);














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
  const s = String(str).
  replace(/['"]/g, '') // strip quotes
  .trim().
  replace(/\s/g, '') // remove spaces (thousands separator)
  .replace(',', '.'); // comma → dot for decimal
  return parseFloat(s) || 0;
}

/**
 * Parse the Dynapharm bonus CSV format.
 * Skips header rows (company name, report date, area) and finds the actual
 * column header row by looking for DRN or NB/NAME keywords.
 * Handles comma and semicolon delimiters.
 */
function parseDynapharmCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Find the column header row; detect delimiter (pipe, semicolon, comma)
  let headerIdx = -1;
  let delimiter = ',';
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes('DRN') || upper.includes('DZ') || upper.includes('NB') && upper.includes('NAME') || upper.includes('NAD')) {
      headerIdx = i;
      if (upper.includes('|')) delimiter = '|';else
      if (upper.includes(';')) delimiter = ';';else
      delimiter = ',';
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
      if (ch === '"') {inQ = !inQ;} else
      if (ch === delimiter && !inQ) {result.push(cur.trim());cur = '';} else
      {cur += ch;}
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[headerIdx]).map((h) =>
  h.replace(/['"]/g, '').toLowerCase().trim()
  );

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.every((v) => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => {row[h] = vals[idx] || '';});
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

  const nbNumber = getValue('drn', 'dz', 'nb number', 'nb_number', 'nbnumber', 'dz_number', 'dz number', 'distributor_code', 'code').toUpperCase();
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

import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
async function handler(req, res) {
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

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/distributor-bonuses.js:185:7"),

      [period]);

      if (existing) {
        return res.status(409).json({ success: false, error: `A deletion request for period ${period} is already pending GM approval.` });
      }

      const agg = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/distributor-bonuses.js:193:8"),

      [period]);

      const recordCount = parseInt(agg?.cnt || 0);
      if (recordCount === 0) {
        return res.status(404).json({ success: false, error: `No bonus records found for period ${period}.` });
      }

      const id = `bdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:203:9"),


      [id, period, recordCount, parseFloat(agg.total || 0), reason || null,
      req.user.fullName || req.user.full_name || req.user.username || req.user.id]);


      return res.json({
        success: true,
        message: `Deletion request for period ${period} submitted. Awaiting GM approval.`,
        requestId: id,
        recordCount,
        totalEarned: parseFloat(agg.total || 0)
      });
    }

    /* ── DELETE REQUEST LIST: Get pending/all delete requests ── */
    if (req.method === 'GET' && req.url.includes('/delete-requests')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const statusFilter = url.searchParams.get('status') || 'pending_gm';
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonuses.js:223:10"),

      [statusFilter]);

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

      const deleteReq = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/distributor-bonuses.js:244:11"), [reqId]);
      if (!deleteReq) return res.status(404).json({ success: false, error: 'Delete request not found.' });
      if (deleteReq.status !== 'pending_gm') {
        return res.status(409).json({ success: false, error: `Request is already ${deleteReq.status}.` });
      }

      const gmName = req.user.sub || req.user.id || req.user.username;
      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:254:12"),



      [newStatus, gmName, gm_notes || null, reqId]);


      if (action === 'approve') {
        await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonuses.js:261:13"), [deleteReq.period]);
      }

      return res.json({
        success: true,
        message: action === 'approve' ?
        `Period ${deleteReq.period} bonus records deleted (${deleteReq.record_count} records removed).` :
        `Deletion request for period ${deleteReq.period} rejected.`,
        action,
        period: deleteReq.period
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
        where.push(__qd_registeredPlan("api/finance/distributor-bonuses.js:286:14", [params.length, params.length]));
      }

      if (period) {
        params.push(period);
        where.push(__qd_registeredPlan("api/finance/distributor-bonuses.js:291:15", [params.length]));
      }

      if (status) {
        params.push(status);
        where.push(__qd_registeredPlan("api/finance/distributor-bonuses.js:296:16", [params.length]));
      }

      const whereClause = where.length ? __qd_registeredPlan("api/finance/distributor-bonuses.js:299:17", [__qd_joinPlans(where, "and")]) : __qd_registeredPlan("api/finance/distributor-bonuses.js:299:18");
      const bonuses = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonuses.js:301:19", [
      whereClause]),
      params);


      if (includePayments && bonuses.length > 0) {
        const bonusIds = bonuses.map((b) => b.id);
        const payments = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonuses.js:308:20"),

        [bonusIds]);

        const payMap = {};
        for (const p of payments) {
          if (!payMap[p.bonus_id]) payMap[p.bonus_id] = [];
          payMap[p.bonus_id].push(p);
        }
        bonuses.forEach((b) => {b.payments = payMap[b.id] || [];});
      }

      return res.json({ success: true, bonuses, total: bonuses.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/distributor-bonuses]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
export default atomicStockRequest(handler);

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
          const nbNumbers = [...new Set(parsed.map((r) => r.nb_number))];
          const existingDistributors = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonuses.js:373:21"),

          [nbNumbers]).
          catch(() => []);
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
