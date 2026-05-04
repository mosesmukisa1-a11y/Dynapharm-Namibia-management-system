import { applyAuthCors } from '../_lib/auth.js';
import { getMany, query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const branchId = url.searchParams.get('branch_id') || '';
      const status   = url.searchParams.get('status')    || '';

      const conds = []; const params = [];
      if (branchId) {
        params.push(branchId.toLowerCase().replace(/ /g, '_'));
        conds.push(`LOWER(REPLACE(branch_id,' ','_')) = $${params.length}`);
      }
      if (status) { params.push(status); conds.push(`status = $${params.length}`); }

      const rows = await getMany(
        `SELECT * FROM branch_refund_requests
         ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
         ORDER BY created_at DESC LIMIT 200`,
        params
      );
      return res.json({ success: true, requests: rows });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { branch_id, sale_reference, product_name, batch_no,
              quantity, unit_price, reason, requested_by } = req.body || {};

      if (!branch_id || !product_name || !quantity || !unit_price || !reason)
        return res.status(400).json({ success: false, error: 'branch_id, product_name, quantity, unit_price and reason are required' });

      const id = `REF-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const refund_amount = (parseFloat(quantity) * parseFloat(unit_price)).toFixed(2);

      await query(
        `INSERT INTO branch_refund_requests
           (id, branch_id, sale_reference, product_name, batch_no, quantity, unit_price, refund_amount, reason, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, branch_id, sale_reference || null, product_name, batch_no || null,
         quantity, unit_price, refund_amount, reason, requested_by || null]
      );
      return res.json({ success: true, id, refund_amount });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
