import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { reportId, branchId, items, createdBy, customerType } = body;

      if (!reportId || !branchId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'reportId, branchId, and items are required' });
      }

      const movType = 'prescription_dispense';
      const deductions = [];
      const insufficientItems = [];

      await withTransaction(async (client) => {
        for (const item of items) {
          const productName = item.product_name || item.name || '';
          const qty = Number(item.quantity || 1);
          if (!productName || qty <= 0) continue;

          let remaining = qty;
          const batches = (await client.query(
            `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
             WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
             ORDER BY expiry_date ASC NULLS LAST
             FOR UPDATE`,
            [branchId, productName]
          )).rows;

          for (const batch of batches) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, Number(batch.quantity));

            await client.query(
              `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
              [take, batch.id]
            );

            const ts = Date.now();
            const bimId = 'BIM-' + ts + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            await client.query(
              `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
              [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take, reportId, 'Prescription dispense', createdBy || '']
            );

            const smId = 'MOV-' + ts + '-' + Math.random().toString(36).slice(2, 6);
            await client.query(
              `INSERT INTO stock_movements (id, product_name, batch_no, quantity, movement_type, source_location, destination_location, reference_id, notes, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'patient', $7, $8, NOW())`,
              [smId, batch.product_name, batch.batch_no || '', take, movType, branchId, reportId, 'Prescription dispense']
            );

            deductions.push({ product_name: batch.product_name, batch_no: batch.batch_no, quantity: take });
            remaining -= take;
          }

          if (remaining > 0) {
            insufficientItems.push({ product_name: productName, requested: qty, available: qty - remaining, short: remaining });
          }
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (need ${i.requested}, have ${i.available})`).join(', ')}`);
        }
      });

      return res.status(200).json({ success: true, deductions, message: `Dispensed ${deductions.length} batch(es) successfully` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Dispense API error:', error);
    if (error.message?.startsWith('Insufficient stock')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}
