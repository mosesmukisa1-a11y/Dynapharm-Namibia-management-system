import { applyAuthCors } from '../../_lib/auth.js';
import { getStockAlerts } from '../../services/gmFinanceMisEngine.js';
import { validateExpiryWarningDays } from '../../../shared/stockAlertPolicy.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const raw = req.query?.thresholdDays;
    let thresholdDays;
    if (raw !== undefined) {
      try { thresholdDays = validateExpiryWarningDays(raw === '' ? NaN : Number(raw)); }
      catch (error) { return res.status(422).json({ success: false, error: error.message }); }
    }
    const alerts = await getStockAlerts(thresholdDays);

    res.json({
      success: true,
      thresholdDays: alerts.thresholdDays,
      alertPolicy: alerts.alertPolicy,
      lowStock: alerts.lowStock,
      expiring: alerts.expiring,
      writeOffRisk: alerts.writeOffRisk,
    });
  } catch (err) {
    console.error('[gm/alerts/stock]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
