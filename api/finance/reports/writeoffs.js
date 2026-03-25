import { applyAuthCors } from '../../_lib/auth.js';
import { getDateRange, getWriteOffs } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);
    const locationId = req.query.locationId || null;

    const writeoffs = await getWriteOffs(start, end, locationId);

    res.json({ success: true, period: { start, end }, writeoffs });
  } catch (err) {
    console.error('[finance/reports/writeoffs]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
