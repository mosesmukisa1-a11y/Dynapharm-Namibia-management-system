import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getOne, query } from '../db.js';
import { DEFAULT_STOCK_ALERT_POLICY, validateStockAlertPolicy } from '../../shared/stockAlertPolicy.js';

const KEY = 'stock_alert_policy';

export async function getStockAlertPolicy() {
  const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/stockAlertPolicy.js:7:0"), [KEY]);
  // Defaults apply only when not configured. Invalid stored data/DB failures surface.
  return row ? validateStockAlertPolicy(JSON.parse(row.value)) : { ...DEFAULT_STOCK_ALERT_POLICY };
}

export async function saveStockAlertPolicy(value) {
  const policy = validateStockAlertPolicy(value);
  await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAlertPolicy.js:15:1"),


  [KEY, JSON.stringify(policy)]);

  return policy;
}
