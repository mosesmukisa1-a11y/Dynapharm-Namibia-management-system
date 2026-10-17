import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { day, fail, sourceSnapshot } from './stockCostLayers.js';

// Used both when goods leave transit and when already-held goods are inspected.
// The latter must not release a different reservation's dispatched quantity.
export async function restoreWarehouseReturnStockTx(client, { sourceId, location, productName, batchNo, expiryDate,
  quantity, originalSource, restoreAvailable = true, releaseDispatched = true }) {
  const row = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/warehouseReturnStock.js:7:0"), [sourceId])).rows[0];
  if (!row || row.location !== location && row.warehouse_id !== location || row.description !== productName ||
  (row.batch_no || '') !== (batchNo || '') || day(row.expiry_date) !== day(expiryDate))
  fail('Original warehouse lot is missing or changed; a reviewed correction is required', 409);
  if (restoreAvailable) {
    if (!['available', 'in_stock', 'active', 'out_of_stock', null, undefined].includes(row.status))
    fail('Original warehouse lot is not available for a saleable return', 409);
    const currentSource = sourceSnapshot(row);
    for (const key of ['cif_unit_cost', 'dpc_unit_value']) {
      const original = originalSource?.[key] ?? null,current = currentSource[key] ?? null;
      if (original === null !== (current === null) || original !== null && Number(original) !== Number(current))
      fail('Original warehouse cost changed or is unresolved; a reviewed correction is required', 409);
    }
  }
  if (releaseDispatched && Number(row.dispatched_quantity || 0) < quantity)
  fail('Original source dispatched quantity is inconsistent; a reviewed correction is required', 409);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/warehouseReturnStock.js:23:1"),


  [restoreAvailable ? quantity : 0, releaseDispatched ? quantity : 0, row.id]);
  if (!restoreAvailable) return;
  const mirrors = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/warehouseReturnStock.js:28:2"),

  [location, productName])).rows;
  const exact = mirrors.filter((m) => (m.batch_no || '') === (batchNo || '') && day(m.expiry_date) === day(expiryDate));
  const generic = mirrors.filter((m) => !m.batch_no && !m.expiry_date);
  const targets = exact.length ? exact : generic;
  if (mirrors.length && targets.length !== 1)
  fail('Warehouse register lot is missing or ambiguous; a reviewed correction is required', 409);
  if (targets.length) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/warehouseReturnStock.js:36:3"), [quantity, targets[0].id]);
}
