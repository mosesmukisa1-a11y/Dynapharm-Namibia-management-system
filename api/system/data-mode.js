/**
 * GET /api/system/data-mode
 * Returns current data mode (live vs sample).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  return res.json({
    success: true,
    mode: 'live',
    sampleDataEnabled: false,
    note: 'System is in live mode. Only real branches, products, users, stock, sales, and consultations are shown.',
  });
}
