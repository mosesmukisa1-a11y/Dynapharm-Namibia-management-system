import { applyAuthCors } from './_lib/auth.js';
import { query } from './db.js';

async function ensureColumns() {
  const cols = [
    `ALTER TABLE training_schedules ADD COLUMN IF NOT EXISTS platform VARCHAR(50)`,
    `ALTER TABLE training_schedules ADD COLUMN IF NOT EXISTS meeting_link TEXT`,
    `ALTER TABLE training_schedules ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'all'`,
    `ALTER TABLE training_schedules ADD COLUMN IF NOT EXISTS description TEXT`,
  ];
  for (const sql of cols) {
    await query(sql).catch(() => {});
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureColumns();

    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT id, title, date, time, location, trainer, platform, meeting_link,
                target_audience, description, created_at
         FROM training_schedules
         ORDER BY date ASC, time ASC
         LIMIT 500`
      );
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { title, date, time, location, trainer, platform, meeting_link, target_audience, description } = req.body || {};
      if (!title || !date) {
        return res.status(400).json({ success: false, error: 'title and date are required' });
      }
      const { rows } = await query(
        `INSERT INTO training_schedules
           (title, date, time, location, trainer, platform, meeting_link, target_audience, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING *`,
        [
          title,
          date,
          time || null,
          location || null,
          trainer || null,
          platform || 'in_person',
          meeting_link || null,
          target_audience || 'all',
          description || null,
        ]
      );
      return res.status(201).json({ success: true, schedule: rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      await query(`DELETE FROM training_schedules WHERE id = $1`, [id]);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[training-schedules]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
