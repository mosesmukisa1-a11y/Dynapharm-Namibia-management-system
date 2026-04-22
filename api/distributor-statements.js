import { query, getMany, getOne } from './db.js';
import { applyAuthCors, getTokenFromRequest, verifyAuthToken } from './_lib/auth.js';

// ── Parse the raw statement file into a map of DRN → section text ──────────
function parseStatementFile(raw) {
  // Each PAGE of a distributor's statement starts with the DYNAPHARM header.
  // Only the FIRST page of each distributor includes the DRN No. line.
  // Continuation pages (page 2, 3 …) have the same header but no DRN line —
  // we append them to the preceding distributor's section so the full
  // statement (all pages) is stored and visible.
  //
  // We also handle both ASCII apostrophe (U+0027) and Unicode right single
  // quote (U+2019) since some systems produce the latter in the header.

  const pages = raw
    .split(/(?=[ \t]{8,}DYNAPHARM\s+INT[\u2019'`]?L)/i)
    .filter(p => p.trim());

  const sections = {};
  let currentDrn = null;

  for (const page of pages) {
    const drnMatch = page.match(/DRN\s*No\.\s*:\s*([A-Z0-9]+)/i);
    if (drnMatch) {
      // First page of a new distributor
      currentDrn = drnMatch[1].trim().toUpperCase();
      sections[currentDrn] = page;
    } else if (currentDrn) {
      // Continuation page — append to the current distributor's section
      sections[currentDrn] += '\n' + page;
    }
  }

  return { sections, count: Object.keys(sections).length };
}

// ── Extract the "Net Amount" / total bonus from a section text ─────────────
function extractNetAmount(sectionText) {
  const m = sectionText.match(/Net\s+Amount\s*:\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  const t = sectionText.match(/Total\s+Bonus\s+([\d,]+\.?\d*)/i);
  if (t) return parseFloat(t[1].replace(/,/g, ''));
  return null;
}

// ── Extract distributor name from a section ────────────────────────────────
function extractName(sectionText) {
  const m = sectionText.match(/Name\s*:\s*(.+?)(?:\s{5,}|Distributor Rank|$)/i);
  return m ? m[1].trim() : null;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url   = new URL(req.url, 'http://localhost');
  const month = url.searchParams.get('month') || null;
  const nb    = (url.searchParams.get('nb') || '').toUpperCase().trim();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // List available months (no nb param)
    if (!nb) {
      const rows = await getMany(
        `SELECT id, month, label, uploaded_by, uploaded_at, total_sections
         FROM distributor_statements
         ORDER BY month DESC`
      );
      return res.json({ success: true, months: rows });
    }

    // Get a specific distributor's section for a given month
    if (!month) {
      // Return the latest month available
      const latest = await getOne(
        `SELECT id, month, label, sections->$1 AS section_text
         FROM distributor_statements
         WHERE sections ? $1
         ORDER BY month DESC LIMIT 1`,
        [nb]
      );
      if (!latest || !latest.section_text) {
        return res.json({ success: true, section: null, month: null });
      }
      return res.json({ success: true, section: latest.section_text, month: latest.month, label: latest.label });
    }

    const row = await getOne(
      `SELECT id, month, label, sections->$1 AS section_text
       FROM distributor_statements
       WHERE month = $2`,
      [nb, month]
    );
    if (!row || !row.section_text) {
      return res.json({ success: true, section: null, month, label: null });
    }
    return res.json({ success: true, section: row.section_text, month: row.month, label: row.label });
  }

  // ── POST (upload) ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let user = null;
    try {
      const token = getTokenFromRequest(req);
      const decoded = verifyAuthToken(token);
      if (decoded?.sub) user = await getOne('SELECT id, username, role FROM users WHERE id = $1 AND is_active != false', [decoded.sub]);
    } catch {}
    if (!user || !['admin', 'gm', 'mis', 'finance', 'director'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { rawContent, month: uploadMonth, label: uploadLabel } = req.body;
    if (!rawContent || !uploadMonth) {
      return res.status(400).json({ error: 'rawContent and month are required' });
    }
    if (!/^\d{4}-\d{2}$/.test(uploadMonth)) {
      return res.status(400).json({ error: 'month must be YYYY-MM format' });
    }

    // Parse the file
    const { sections, count } = parseStatementFile(rawContent);
    if (count === 0) {
      return res.status(400).json({ error: 'No distributor sections found in the file. Make sure it is the correct Dynapharm bonus statement text file.' });
    }

    // Build a summary index: DRN -> { name, netAmount }
    const summaryIndex = {};
    for (const [drn, text] of Object.entries(sections)) {
      summaryIndex[drn] = {
        name: extractName(text),
        netAmount: extractNetAmount(text),
      };
    }

    const id = `stmt-${uploadMonth}-${Date.now()}`;
    const finalLabel = uploadLabel || uploadMonth;

    // Upsert — replace if same month already uploaded
    await query(
      `INSERT INTO distributor_statements (id, month, label, uploaded_by, uploaded_at, total_sections, sections, summary_index)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6::jsonb,$7::jsonb)
       ON CONFLICT (month) DO UPDATE
         SET id = EXCLUDED.id,
             label = EXCLUDED.label,
             uploaded_by = EXCLUDED.uploaded_by,
             uploaded_at = EXCLUDED.uploaded_at,
             total_sections = EXCLUDED.total_sections,
             sections = EXCLUDED.sections,
             summary_index = EXCLUDED.summary_index`,
      [id, uploadMonth, finalLabel, user.username || user.role, count,
       JSON.stringify(sections), JSON.stringify(summaryIndex)]
    );

    return res.json({ success: true, month: uploadMonth, count, label: finalLabel });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    let user = null;
    try {
      const token = getTokenFromRequest(req);
      const decoded = verifyAuthToken(token);
      if (decoded?.sub) user = await getOne('SELECT id, username, role FROM users WHERE id = $1 AND is_active != false', [decoded.sub]);
    } catch {}
    if (!user || !['admin', 'gm', 'mis', 'director'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const delMonth = url.searchParams.get('month') || req.body?.month;
    if (!delMonth) return res.status(400).json({ error: 'month is required' });
    await query(`DELETE FROM distributor_statements WHERE month = $1`, [delMonth]);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
