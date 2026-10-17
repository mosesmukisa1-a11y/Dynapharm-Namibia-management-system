import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { query, getMany, withTransaction } from './db.js';
import { ensureDistributorsTable } from './distributors.js';
import { applyAuthCors } from './_lib/auth.js';

const POSITION_MAP = {
  'DI': 'Distributor',
  'M': 'Manager',
  'SM': 'Senior Manager',
  'CDM': 'Country Director Manager',
  'RM': 'Regional Manager',
  'DM': 'District Manager',
  'PM': 'Provincial Manager'
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
    entity_type: 'distributor'
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

    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:85:0"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:86:1"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:87:2"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:88:3"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:89:4"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:90:5"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:91:6"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:92:7"), []);
    await __qd_executePlan(query, __qd_registeredPlan("api/distributor-import.js:93:8"), []);

    const body = req.body || {};
    const rows = body.distributors || [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No distributor data provided. Send { distributors: [...] }' });
    }

    const parsed = rows.map(parseRow).filter(Boolean);
    if (parsed.length === 0) {
      return res.status(400).json({ error: 'No valid distributor rows found. Each row must have at least a DRN/NB/DZ code and NAME.' });
    }

    const existing = await __qd_executePlan(getMany, __qd_registeredPlan("api/distributor-import.js:107:9"), ['distributor']);
    const existingSet = new Set(existing.map((e) => e.distributor_code));

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
            if (existingSet.has(dist.distributor_code)) {
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-import.js:124:10"),














              [
              dist.distributor_name,
              dist.position,
              dist.position_code,
              dist.mobile_no,
              dist.sex,
              dist.location,
              dist.status,
              dist.email,
              dist.level,
              dist.date_joined,
              dist.sponsor_code,
              dist.distributor_code]);


              updated++;
            } else {
              const id = `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-import.js:157:11"),















              [id, dist.distributor_code, dist.distributor_name, dist.position, dist.position_code, dist.date_joined, dist.sponsor_code, dist.mobile_no, dist.sex, dist.location, dist.status, dist.email, dist.level, dist.entity_type]);

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
        errors: errors.length
      },
      errors: errors.slice(0, 50),
      message: `Import complete: ${inserted} new, ${updated} updated, ${skipped} unchanged, ${errors.length} errors`
    });
  } catch (error) {
    console.error('Distributor import error:', error);
    return res.status(500).json({ error: error.message || 'Import failed' });
  }
}
