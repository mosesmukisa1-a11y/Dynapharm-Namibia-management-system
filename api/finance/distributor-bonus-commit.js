import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

const FINANCE_ROLES = new Set(['admin', 'gm', 'director', 'finance']);

async function ensureTables() {
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:7:0"), []);
















  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:24:1"), []);
  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:25:2"), []);











  await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:37:3"), []);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const role = req.user.role || '';
  if (!FINANCE_ROLES.has(role)) {
    return res.status(403).json({ success: false, error: 'Finance access required' });
  }

  try {
    await ensureTables();

    const body = req.body || {};
    const { rows, period } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided' });
    }
    if (!period) {
      return res.status(400).json({ success: false, error: 'Period is required' });
    }

    const uploadedBy = req.user.full_name || req.user.username || 'finance';

    const nbNumbers = [...new Set(rows.map((r) => r.nb_number).filter(Boolean))];
    const existingDistributors = nbNumbers.length ?
    await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:72:4"),

    [nbNumbers]).
    catch(() => []) :
    [];
    const distIdMap = {};
    for (const d of existingDistributors) {
      if (d.nb_number) distIdMap[d.nb_number.toUpperCase()] = d.id;
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const { nb_number, distributor_name, amount_earned } = row;
        if (!nb_number || !amount_earned) {skipped++;continue;}

        const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:91:5"),

        [nb_number, period]);

        if (existing) {skipped++;continue;}

        const distributorId = row.distributor_id || distIdMap[nb_number] || null;
        const id = `BONUS-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        await __qd_executePlan(query, __qd_registeredPlan("api/finance/distributor-bonus-commit.js:99:6"),


        [id, period, distributorId, nb_number, distributor_name, amount_earned, uploadedBy]);

        inserted++;
      } catch (rowErr) {
        errors.push({ nb: row.nb_number, error: rowErr.message });
      }
    }

    return res.json({
      success: true,
      inserted,
      skipped,
      errors: errors.length,
      message: `Committed ${inserted} bonus records for period ${period}. ${skipped} skipped (duplicates).`
    });
  } catch (err) {
    console.error('[finance/distributor-bonus-commit]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
