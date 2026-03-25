import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

const VALID_TYPES = ['warning', 'termination', 'attendance', 'performance'];

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://localhost`);
  const typeFilter = url.searchParams.get('type');

  try {
    if (req.method === 'GET') {
      let sql = `SELECT * FROM hr_records WHERE 1=1`;
      const params = [];
      if (typeFilter) { params.push(typeFilter); sql += ` AND type = $${params.length}`; }
      const empFilter = url.searchParams.get('employee_name');
      if (empFilter) { params.push(empFilter); sql += ` AND employee_name ILIKE $${params.length}`; }
      sql += ` ORDER BY created_at DESC LIMIT 500`;

      const result = await query(sql, params);
      return res.json({ success: true, records: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const {
        type, employee_name, employee_id, subtype,
        notes, reason, effective_date, date,
        clock_in, clock_out, rating,
        strengths, improvements, goals,
        severance, status, metadata
      } = body;

      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (!employee_name) {
        return res.status(400).json({ success: false, error: 'employee_name is required' });
      }

      const result = await query(
        `INSERT INTO hr_records
           (type, employee_name, employee_id, subtype, notes, reason, effective_date, date,
            clock_in, clock_out, rating, strengths, improvements, goals,
            severance, status, metadata, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
         RETURNING *`,
        [
          type,
          employee_name,
          employee_id || null,
          subtype || null,
          notes || null,
          reason || null,
          effective_date || null,
          date || new Date().toISOString().slice(0, 10),
          clock_in || null,
          clock_out || null,
          rating ? Number(rating) : null,
          strengths || null,
          improvements || null,
          goals || null,
          severance ? Number(severance) : null,
          status || 'active',
          metadata ? JSON.stringify(metadata) : null,
          req.user?.full_name || req.user?.username || null,
        ]
      );

      return res.status(201).json({ success: true, record: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const id = url.searchParams.get('id') || (req.body || {}).id;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      const body = req.body || {};
      const result = await query(
        `UPDATE hr_records SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [body.status || null, body.notes || null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Record not found' });
      return res.json({ success: true, record: result.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/records]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
