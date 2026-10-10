import { getOne, query } from '../db.js';
import { DEFAULT_STOCK_ALERT_POLICY, validateStockAlertPolicy } from '../../shared/stockAlertPolicy.js';

const KEY = 'stock_alert_policy';

export async function getStockAlertPolicy() {
  const row = await getOne('SELECT value FROM system_settings WHERE key = $1', [KEY]);
  // Defaults apply only when not configured. Invalid stored data/DB failures surface.
  return row ? validateStockAlertPolicy(JSON.parse(row.value)) : { ...DEFAULT_STOCK_ALERT_POLICY };
}

export async function saveStockAlertPolicy(value) {
  const policy = validateStockAlertPolicy(value);
  await query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KEY, JSON.stringify(policy)],
  );
  return policy;
}
