import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const url    = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status')    || '';
      const branch = url.searchParams.get('branch_id') || '';

      const conds = []; const params = [];
      if (status) { params.push(status); conds.push(`status = $${params.length}`); }
      if (branch) {
        params.push(branch.toLowerCase().replace(/ /g, '_'));
        conds.push(`LOWER(REPLACE(branch_id,' ','_')) = $${params.length}`);
      }

      const rows = await getMany(
        `SELECT * FROM branch_refund_requests
         ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
         ORDER BY created_at DESC LIMIT 500`,
        params
      );
      return res.json({ success: true, requests: rows });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, action, approved_by, rejection_reason } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ success: false, error: 'id and action are required' });

      const refund = await getOne('SELECT * FROM branch_refund_requests WHERE id = $1', [id]);
      if (!refund) return res.status(404).json({ success: false, error: 'Refund request not found' });
      if (refund.status !== 'pending')
        return res.status(400).json({ success: false, error: 'Request has already been processed' });

      if (action === 'approve') {
        const movId = `RFND-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        await query(
          `INSERT INTO branch_inventory_movements
             (id, branch_id, type, product_name, batch_no, quantity, unit_price, reference, notes, created_by, created_at)
           VALUES ($1,$2,'refund_return',$3,$4,$5,$6,$7,$8,$9,NOW())`,
          [movId, refund.branch_id, refund.product_name, refund.batch_no || null,
           refund.quantity, refund.unit_price, refund.id,
           `Refund approved — ${refund.reason}`, approved_by || 'Stock Manager']
        );
        await query(
          `UPDATE branch_refund_requests
           SET status='approved', approved_by=$1, movement_id=$2, processed_at=NOW()
           WHERE id=$3`,
          [approved_by || 'Stock Manager', movId, id]
        );
        return res.json({ success: true, movement_id: movId,
          message: `Refund approved — ${refund.quantity} × ${refund.product_name} returned to ${refund.branch_id} stock` });
      }

      if (action === 'reject') {
        if (!rejection_reason?.trim())
          return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting' });
        await query(
          `UPDATE branch_refund_requests
           SET status='rejected', approved_by=$1, rejection_reason=$2, processed_at=NOW()
           WHERE id=$3`,
          [approved_by || 'Stock Manager', rejection_reason, id]
        );
        return res.json({ success: true, message: 'Refund request rejected' });
      }

      return res.status(400).json({ success: false, error: 'action must be approve or reject' });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
