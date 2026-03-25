import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany } from '../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { branch_id, client_name, client_phone, nb_number, visit_type, checkin_time, served_by, notes } = body;

      if (!branch_id) return res.status(400).json({ success: false, error: 'branch_id required' });

      const id = `BCV-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const checkin = checkin_time || new Date().toISOString();

      await query(
        `INSERT INTO branch_client_visits (id, branch_id, client_name, client_phone, nb_number, visit_type, checkin_time, served_by, status, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'checked_in',$9,$10)`,
        [id, branch_id, client_name || 'Walk-in', client_phone || null, nb_number || null, visit_type || 'walk_in', checkin, served_by || null, notes || null, new Date()]
      );

      return res.status(201).json({
        success: true,
        visit_id: id,
        message: 'Client checked in successfully',
        checkin_time: checkin,
      });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const branchId = url.searchParams.get('branch_id') || '';
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

      const conds = [`checkin_time::date = $1`];
      const params = [date];
      if (branchId) { conds.push(`branch_id = $${params.length + 1}`); params.push(branchId); }

      const visits = await getMany(
        `SELECT * FROM branch_client_visits WHERE ${conds.join(' AND ')} ORDER BY checkin_time DESC LIMIT 200`,
        params
      );

      return res.status(200).json({
        success: true,
        date,
        visits,
        summary: {
          total: visits.length,
          byType: visits.reduce((acc, v) => { acc[v.visit_type] = (acc[v.visit_type] || 0) + 1; return acc; }, {}),
        },
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('branch-client-visits/checkin error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
