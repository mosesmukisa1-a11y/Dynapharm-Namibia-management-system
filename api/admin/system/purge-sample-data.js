import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js"; /**
 * POST /api/admin/system/purge-sample-data
 * Purges any records flagged as sample/test data.
 */
import { getMany, query } from '../../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const body = await parseBody(req);
  if (!body.confirm) return res.status(400).json({ success: false, error: 'confirm: true is required to purge data' });

  const purged = [];

  // Purge test/sample stock movements
  const testMovements = await __qd_executePlan(getMany, __qd_registeredPlan("api/admin/system/purge-sample-data.js:26:0"), []);


  if (testMovements.length > 0) {
    const ids = testMovements.map((r) => r.id);
    await __qd_executePlan(query, __qd_registeredPlan("api/admin/system/purge-sample-data.js:30:1"), [ids]);
    purged.push(`${testMovements.length} test stock movements`);
  }

  // Purge test inventory_balances
  const testBalances = await __qd_executePlan(getMany, __qd_registeredPlan("api/admin/system/purge-sample-data.js:36:2"), []);


  if (testBalances.length > 0) {
    await __qd_executePlan(query, __qd_registeredPlan("api/admin/system/purge-sample-data.js:39:3"), []);
    purged.push(`${testBalances.length} test inventory balances`);
  }

  return res.json({
    success: true,
    sampleDataEnabled: false,
    purged,
    message: purged.length > 0 ? `Purged: ${purged.join(', ')}` : 'No sample/test records found to purge.'
  });
}
