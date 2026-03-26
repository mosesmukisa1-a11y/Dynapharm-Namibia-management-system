import { applyAuthCors } from './_lib/auth.js';
import { query } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT id, title, date, time, location, trainer, created_at
         FROM training_schedules
         ORDER BY date ASC, time ASC
         LIMIT 200`
      );
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { title, date, time, location, trainer } = req.body || {};
      if (!title || !date) {
        return res.status(400).json({ success: false, error: 'title and date are required' });
      }
      const { rows } = await query(
        `INSERT INTO training_schedules (title, date, time, location, trainer, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [title, date, time || null, location || null, trainer || null]
      );
      return res.status(201).json({ success: true, schedule: rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[training-schedules]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
