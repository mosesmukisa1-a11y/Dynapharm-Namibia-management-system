/**
 * POST /api/admin/system/purge-sample-data
 * Purges any records flagged as sample/test data.
 */
import { getMany, query } from '../../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const body = await parseBody(req);
  if (!body.confirm) return res.status(400).json({ success: false, error: 'confirm: true is required to purge data' });

  const purged = [];

  // Purge test/sample stock movements
  const testMovements = await getMany(
    `SELECT id FROM stock_movements WHERE product_name ILIKE '%test%' OR notes ILIKE '%test%' OR notes ILIKE '%sample%' OR notes ILIKE '%demo%'`
  );
  if (testMovements.length > 0) {
    const ids = testMovements.map(r => r.id);
    await query(`DELETE FROM stock_movements WHERE id = ANY($1)`, [ids]);
    purged.push(`${testMovements.length} test stock movements`);
  }

  // Purge test inventory_balances
  const testBalances = await getMany(
    `SELECT location_id, product_name FROM inventory_balances WHERE product_name ILIKE '%test%'`
  );
  if (testBalances.length > 0) {
    await query(`DELETE FROM inventory_balances WHERE product_name ILIKE '%test%'`);
    purged.push(`${testBalances.length} test inventory balances`);
  }

  return res.json({
    success: true,
    sampleDataEnabled: false,
    purged,
    message: purged.length > 0 ? `Purged: ${purged.join(', ')}` : 'No sample/test records found to purge.',
  });
}
