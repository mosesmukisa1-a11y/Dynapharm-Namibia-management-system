import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getMany } from '../db.js';
import { businessDay, validateBusinessDates } from './businessDates.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
export async function getSlowMovingStock(layers, { locations, productName, inactivityDays = 90, asOf = businessDay() } = {}, read = getMany) {
  if (!Number.isSafeInteger(inactivityDays) || inactivityDays < 1 || inactivityDays > 3650)
  throw Object.assign(Error('Sales inactivity period must be 1–3650 days'), { statusCode: 422 });
  validateBusinessDates(asOf, asOf);
  const activity = await __qd_executePlan(read, __qd_registeredPlan("api/services/slowMovingStock.js:8:0"),








  [locations || null, productName || null, asOf]);
  const last = new Map();
  for (const row of activity) {
    const id = JSON.stringify([normalizeBranchSlug(row.location), row.product]);
    if (!last.has(id) || new Date(row.last_activity) > new Date(last.get(id))) last.set(id, row.last_activity);
  }
  const grouped = new Map();
  for (const layer of layers) {
    if (layer.availableQty <= 0) continue;
    const id = JSON.stringify([normalizeBranchSlug(layer.location), String(layer.productName).toLowerCase().trim()]);
    if (!grouped.has(id)) grouped.set(id, { location: layer.location, product: layer.productName, availableQty: 0 });
    grouped.get(id).availableQty += layer.availableQty;
  }
  const cutoff = new Date(Date.parse(asOf) - inactivityDays * 86400000).toISOString().slice(0, 10);
  const rows = [...grouped.entries()].map(([id, row]) => {
    const timestamp = last.get(id),date = timestamp ? businessDay(new Date(timestamp)) : null;
    return { ...row, lastActivity: date, daysSinceActivity: date ? Math.floor((Date.parse(asOf) - Date.parse(date)) / 86400000) : null,
      status: !date ? 'NO RECORDED ACTIVITY — AGE UNVERIFIED' : date <= cutoff ? 'SLOW MOVING' : 'ACTIVE' };
  });
  return { inactivityDays, asOf, timezone: 'Africa/Windhoek', rows,
    definition: 'Current available stock with no recorded sale/dispense/free-item issue in the stated calendar-day period. Transfers, returns and write-offs are not sales activity.',
    limitation: 'No recorded activity does not prove this stock is old; incomplete history and newly received products require receipt/count evidence. Stock is current, not reconstructed at a past date.' };
}
