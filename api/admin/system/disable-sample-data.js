/**
 * POST /api/admin/system/disable-sample-data
 * Confirms sample data is disabled (live mode is default).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  return res.json({ success: true, sampleDataEnabled: false, message: 'System is already in live mode. Sample data is disabled.' });
}
