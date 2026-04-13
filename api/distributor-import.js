import { query, getMany, withTransaction } from './db.js';
import { ensureDistributorsTable } from './distributors.js';
import { applyAuthCors } from './_lib/auth.js';

const POSITION_MAP = {
  'DI': 'Distributor',
  'M': 'Manager',
  'SM': 'Senior Manager',
  'CDM': 'Country Director Manager',
  'RM': 'Regional Manager',
  'DM': 'District Manager',
  'PM': 'Provincial Manager',
};

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function parseRow(row) {
  const drn = (row.DRN || row.drn || row.nb_number || row.NB_NUMBER || row.DZ || row.dz || '').toString().trim().toUpperCase();
  if (!drn || drn.length < 2 || !/^[A-Z]{1,4}[0-9]/.test(drn)) return null;

  const name = (row.NAME || row.name || row.distributor_name || '').toString().trim();
  if (!name) return null;

  const posCode = (row.POSITION || row.position || row.N_POSITION || '').toString().trim().toUpperCase();
  const position = POSITION_MAP[posCode] || posCode || 'Distributor';

  let dateJoined = null;
  const rawDate = row.DATE_CREATE || row.DATE_JOINED || row.date_joined || row.date_create;
  if (rawDate) {
    if (typeof rawDate === 'number') {
      dateJoined = excelDateToISO(rawDate);
    } else {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) dateJoined = parsed.toISOString().slice(0, 10);
    }
  }

  const sponsorCode = (row.SPONSOR_CODE || row.sponsor_code || '').toString().trim().toUpperCase() || null;
  const mobile = (row.MOBILE_TELE || row.mobile_no || row.mobile || row.phone || '').toString().trim() || null;
  const sex = (row.SEX || row.sex || '').toString().trim() || null;
  const city = (row.CITY || row.city || row.ADDR1 || row.addr1 || '').toString().trim() || null;
  const status = (row.STATUS || row.status || '').toString().trim().toUpperCase();
  const statusMapped = status === 'A' ? 'active' : status === 'Y' ? 'active' : status === 'S' ? 'suspended' : 'active';
  const email = (row.EMAIL || row.email || '').toString().trim() || null;
  const level = row.LEVEL || row.level || null;

  return {
    distributor_code: drn,
    distributor_name: name,
    position,
    position_code: posCode,
    date_joined: dateJoined,
    sponsor_code: sponsorCode,
    mobile_no: mobile,
    sex,
    location: city,
    status: statusMapped,
    email: email && email !== 'null' ? email : null,
    level: level ? Number(level) : null,
    entity_type: 'distributor',
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userRole = req.user?.role || '';
  if (!['admin', 'director', 'gm'].includes(userRole)) {
    return res.status(403).json({ error: 'Only admin, director, or GM can import distributors' });
  }

  try {
    await ensureDistributorsTable();

    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS position TEXT DEFAULT 'Distributor'`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS position_code TEXT`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS date_joined TEXT`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS sponsor_code TEXT`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS sex TEXT`);
    await query(`ALTER TABLE distributors ADD COLUMN IF NOT EXISTS level INTEGER`);

    const body = req.body || {};
    const rows = body.distributors || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No distributor data provided. Send { distributors: [...] }' });
    }

    const parsed = rows.map(parseRow).filter(Boolean);
    if (parsed.length === 0) {
      return res.status(400).json({ error: 'No valid distributor rows found. Each row must have at least a DRN/NB/DZ code and NAME.' });
    }

    const existing = await getMany('SELECT distributor_code, position, position_code FROM distributors WHERE entity_type = $1', ['distributor']);
    const existingMap = new Map();
    for (const e of existing) {
      existingMap.set(e.distributor_code, e);
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const BATCH_SIZE = 200;

    for (let batch = 0; batch < parsed.length; batch += BATCH_SIZE) {
      const chunk = parsed.slice(batch, batch + BATCH_SIZE);

      await withTransaction(async (client) => {
        for (const dist of chunk) {
          try {
            const existingDist = existingMap.get(dist.distributor_code);

            if (existingDist) {
              if (existingDist.position_code !== dist.position_code) {
                await client.query(
                  `UPDATE distributors SET position = $1, position_code = $2, updated_at = NOW() WHERE distributor_code = $3`,
                  [dist.position, dist.position_code, dist.distributor_code]
                );
                updated++;
              } else {
                skipped++;
              }
            } else {
              const id = `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
              await client.query(
                `INSERT INTO distributors (id, distributor_code, distributor_name, position, position_code, date_joined, sponsor_code, mobile_no, sex, location, status, email, level, entity_type)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT (distributor_code) DO UPDATE SET
                   position = EXCLUDED.position,
                   position_code = EXCLUDED.position_code,
                   updated_at = NOW()`,
                [id, dist.distributor_code, dist.distributor_name, dist.position, dist.position_code, dist.date_joined, dist.sponsor_code, dist.mobile_no, dist.sex, dist.location, dist.status, dist.email, dist.level, dist.entity_type]
              );
              inserted++;
            }
          } catch (rowErr) {
            errors.push({ code: dist.distributor_code, error: rowErr.message });
          }
        }
      });
    }

    return res.json({
      success: true,
      summary: {
        total_processed: parsed.length,
        inserted,
        updated,
        skipped,
        errors: errors.length,
      },
      errors: errors.slice(0, 50),
      message: `Import complete: ${inserted} new, ${updated} position updates, ${skipped} unchanged, ${errors.length} errors`,
    });
  } catch (error) {
    console.error('Distributor import error:', error);
    return res.status(500).json({ error: error.message || 'Import failed' });
  }
}
