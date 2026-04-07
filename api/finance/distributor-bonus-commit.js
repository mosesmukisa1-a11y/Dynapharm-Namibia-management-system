import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';

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

    const nbNumbers = [...new Set(rows.map(r => r.nb_number).filter(Boolean))];
    const existingDistributors = nbNumbers.length
      ? await getMany(
          `SELECT id, distributor_code AS nb_number FROM distributors WHERE distributor_code = ANY($1)`,
          [nbNumbers]
        ).catch(() => [])
      : [];
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
        if (!nb_number || !amount_earned) { skipped++; continue; }

        const existing = await getOne(
          `SELECT id FROM distributor_bonuses WHERE nb_number = $1 AND period = $2`,
          [nb_number, period]
        );
        if (existing) { skipped++; continue; }

        const distributorId = row.distributor_id || distIdMap[nb_number] || null;
        const id = `BONUS-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        await query(
          `INSERT INTO distributor_bonuses (id, period, distributor_id, nb_number, distributor_name, amount_earned, amount_paid, status, uploaded_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending', $7, NOW(), NOW())`,
          [id, period, distributorId, nb_number, distributor_name, amount_earned, uploadedBy]
        );
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
      message: `Committed ${inserted} bonus records for period ${period}. ${skipped} skipped (duplicates).`,
    });
  } catch (err) {
    console.error('[finance/distributor-bonus-commit]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
