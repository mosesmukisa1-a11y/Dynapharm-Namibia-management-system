import { query } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = new URL(req.url, 'http://localhost');
  const branch   = url.searchParams.get('branch') || null;
  const rootNb   = url.searchParams.get('root_nb') || null;
  const monthStr = url.searchParams.get('month') || null;
  const limitStr = url.searchParams.get('limit') || '500';
  const offsetStr = url.searchParams.get('offset') || '0';
  const search   = url.searchParams.get('search') || null;

  // Determine the period (default = current month)
  let periodStart, periodEnd, bonusLabel;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [yr, mo] = monthStr.split('-').map(Number);
    periodStart = new Date(yr, mo - 1, 1);
    periodEnd   = new Date(yr, mo, 1);
    const lastDay = new Date(yr, mo, 0);
    bonusLabel = `${yr}-${String(mo).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
  } else {
    const now = new Date();
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    bonusLabel = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(lastDay.getDate()).padStart(2,'0')}`;
  }

  try {
    // ── 1. Load ALL distributors (for tree traversal) ─────────────────────────
    const allDistsRes = await query(
      `SELECT distributor_code, distributor_name, sponsor_code,
              position, position_code, branch, status, date_joined,
              mobile_no, email, sex, level
       FROM distributors
       WHERE entity_type = 'distributor' OR entity_type IS NULL
       ORDER BY distributor_code`,
      []
    );
    const allDists = allDistsRes.rows;

    // ── 2. Build lookup maps ───────────────────────────────────────────────────
    const distByCode = {};
    const childMap   = {}; // code -> [child codes]
    for (const d of allDists) {
      distByCode[d.distributor_code] = d;
      if (d.sponsor_code && d.sponsor_code !== d.distributor_code) {
        if (!childMap[d.sponsor_code]) childMap[d.sponsor_code] = [];
        childMap[d.sponsor_code].push(d.distributor_code);
      }
    }

    // ── 3. Load period BV from sales ──────────────────────────────────────────
    const bvRes = await query(
      `SELECT
         COALESCE(referral_nb, distributor_nb) as nb,
         SUM(
           COALESCE(NULLIF(total_bv,0),
             (SELECT COALESCE(SUM(
               COALESCE((elem->>'bv')::numeric,0) *
               COALESCE((elem->>'quantity')::numeric,1)
             ),0)
             FROM jsonb_array_elements(CASE WHEN items IS NOT NULL AND jsonb_typeof(items)='array' THEN items ELSE '[]'::jsonb END) elem
             ),
           0)
         ) as bv,
         COUNT(*) as sales_count
       FROM branch_walkin_sales
       WHERE sale_date >= $1 AND sale_date < $2
         AND (referral_nb IS NOT NULL OR distributor_nb IS NOT NULL)
       GROUP BY COALESCE(referral_nb, distributor_nb)`,
      [periodStart.toISOString(), periodEnd.toISOString()]
    );
    const bvMap = {};
    const salesCountMap = {};
    for (const r of bvRes.rows) {
      if (r.nb) {
        bvMap[r.nb] = Number(r.bv) || 0;
        salesCountMap[r.nb] = Number(r.sales_count) || 0;
      }
    }

    // ── 4. Memoised GBV computation ───────────────────────────────────────────
    const gbvCache  = {};
    const pgbvCache = {};
    const visitStack = new Set();

    function getGBV(code) {
      if (gbvCache[code] !== undefined) return gbvCache[code];
      if (visitStack.has(code)) return bvMap[code] || 0; // cycle guard
      visitStack.add(code);
      let gbv = bvMap[code] || 0;
      for (const child of (childMap[code] || [])) {
        gbv += getGBV(child);
      }
      visitStack.delete(code);
      gbvCache[code] = gbv;
      return gbv;
    }

    function getPGBV(code) {
      if (pgbvCache[code] !== undefined) return pgbvCache[code];
      const psbv = bvMap[code] || 0;
      let pgbv = psbv;
      for (const child of (childMap[code] || [])) {
        pgbv += (bvMap[child] || 0);
      }
      pgbvCache[code] = pgbv;
      return pgbv;
    }

    // ── 5. Filter which distributors to return ────────────────────────────────
    let targetCodes = null; // null = all

    if (rootNb) {
      // Distributor portal: return the root + all their downline (BFS)
      targetCodes = new Set();
      const queue = [rootNb];
      while (queue.length) {
        const code = queue.shift();
        if (targetCodes.has(code)) continue;
        targetCodes.add(code);
        for (const child of (childMap[code] || [])) {
          queue.push(child);
        }
      }
    }

    // ── 6. Build result rows ──────────────────────────────────────────────────
    let rows = allDists;
    if (targetCodes) rows = rows.filter(d => targetCodes.has(d.distributor_code));
    if (branch)      rows = rows.filter(d => d.branch === branch);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(d =>
        (d.distributor_name || '').toLowerCase().includes(q) ||
        (d.distributor_code || '').toLowerCase().includes(q) ||
        (d.sponsor_code || '').toLowerCase().includes(q)
      );
    }

    const totalCount = rows.length;
    const limit  = Math.min(parseInt(limitStr) || 500, 2000);
    const offset = parseInt(offsetStr) || 0;
    const paged  = rows.slice(offset, offset + limit);

    const result = paged.map(d => {
      const code     = d.distributor_code;
      const psbv     = bvMap[code] || 0;
      const pgbv     = getPGBV(code);
      const gbv      = getGBV(code);
      const recruits = (childMap[code] || []);
      const recruitCount = recruits.length;
      const am = recruits.filter(c => (salesCountMap[c] || 0) > 0).length;

      // Upline / sponsor info
      const sponsor     = distByCode[d.sponsor_code];
      const sponsorName = sponsor ? sponsor.distributor_name : (d.sponsor_code || '—');

      // Rank computation: active rank downgrades if no PSBV
      const currentRank = d.position_code || 'DI';
      const adjustedRank = currentRank;
      const activeRank = psbv > 0 ? currentRank : (gbv > 0 ? 'M' : '—');

      return {
        drn:          code,
        name:         d.distributor_name,
        directUpline: d.sponsor_code || '—',
        directUplineName: sponsorName,
        orgSponsor:   d.sponsor_code || '—',
        currentRank,
        adjustedRank,
        activeRank,
        am,
        recruit:      recruitCount,
        psbv:         +psbv.toFixed(2),
        pgbv:         +pgbv.toFixed(2),
        gbv:          +gbv.toFixed(2),
        branch:       d.branch || '',
        status:       d.status || 'active',
        position:     d.position || 'Distributor',
        dateJoined:   d.date_joined || '',
        phone:        d.mobile_no || '',
        email:        d.email || '',
        sex:          d.sex || '',
        level:        d.level || 0,
      };
    });

    return res.json({
      success: true,
      bonusMonth: bonusLabel,
      totalCount,
      offset,
      limit,
      rows: result,
    });

  } catch (err) {
    console.error('distributor-network error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
