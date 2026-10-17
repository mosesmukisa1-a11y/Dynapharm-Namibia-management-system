import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";export async function lockStockBatchTx(client, location, product, batchNo, expiryDate) {
  const expiry = expiryDate instanceof Date ? expiryDate.toISOString().slice(0, 10) : String(expiryDate || '').slice(0, 10);
  const key = JSON.stringify(['stock-batch', location, String(product).toLowerCase().trim(), batchNo || '', expiry]);
  // Lock the logical key even when there is no physical row to FOR UPDATE.
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockLocks.js:5:0"), [key]);
}
