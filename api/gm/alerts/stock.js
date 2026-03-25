import { applyAuthCors } from '../../_lib/auth.js';
import { getStockAlerts } from '../../services/gmFinanceMisEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const thresholdDays = parseInt(req.query.thresholdDays || '90', 10);
    const alerts = await getStockAlerts(thresholdDays);

    res.json({
      success: true,
      thresholdDays,
      lowStock: alerts.lowStock,
      expiring: alerts.expiring,
      writeOffRisk: alerts.writeOffRisk,
    });
  } catch (err) {
    console.error('[gm/alerts/stock]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
