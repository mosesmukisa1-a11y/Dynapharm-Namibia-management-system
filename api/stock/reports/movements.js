import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const from = url.searchParams.get('date_from') || null;
    const to = url.searchParams.get('date_to') || null;
    const movementType = url.searchParams.get('type') || '';
    const location = url.searchParams.get('location') || '';
    const search = url.searchParams.get('search') || '';

    let conditions = ['1=1'];
    const params = [];
    if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
    if (to) { params.push(to + 'T23:59:59'); conditions.push(`created_at <= $${params.length}`); }
    if (movementType) { params.push(movementType); conditions.push(`movement_type = $${params.length}`); }
    if (location) { params.push(`%${location}%`); conditions.push(`(source_location ILIKE $${params.length} OR destination_location ILIKE $${params.length})`); }

    const movements = await getMany(
      `SELECT * FROM stock_movements WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    let filtered = movements;
    if (search) filtered = filtered.filter(m => (m.product_name || '').toLowerCase().includes(search.toLowerCase()));

    res.status(200).json({ success: true, movements: filtered, total: filtered.length });
  } catch (err) {
    console.error('Movements report error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
