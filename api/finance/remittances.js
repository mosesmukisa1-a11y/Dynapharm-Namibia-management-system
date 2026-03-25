import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const result = await query(
        `SELECT * FROM finance_remittances ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({ success: true, remittances: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { amount, reference, date, notes, status } = body;

      if (!reference) {
        return res.status(400).json({ success: false, error: 'Payment reference is required' });
      }

      const result = await query(
        `INSERT INTO finance_remittances
           (amount, reference, payment_date, notes, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [
          Number(amount) || 0,
          reference,
          date || new Date().toISOString().slice(0, 10),
          notes || null,
          status || 'completed',
          req.user?.full_name || req.user?.username || null,
        ]
      );

      return res.status(201).json({ success: true, remittance: result.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/remittances]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
