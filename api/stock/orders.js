import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, insert, update } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const branchId = url.searchParams.get('branchId') || '';

      const conditions = ['1=1'];
      const params = [];
      if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
      if (branchId && branchId !== 'all') { conditions.push(`requesting_branch = $${params.length + 1}`); params.push(branchId); }

      const orders = await getMany(
        `SELECT * FROM stock_requests WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
        params
      );

      const formatted = orders.map(o => {
        let items = [];
        try { items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []); } catch {}
        return {
          orderId: o.id,
          branchId: o.requesting_branch || o.branch_id,
          branchName: (o.requesting_branch || o.branch_id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          requestedBy: o.requested_by || o.created_by,
          status: o.status,
          priority: o.priority || 'normal',
          notes: o.notes,
          items,
          createdAt: o.created_at,
          updatedAt: o.updated_at,
        };
      });

      return res.status(200).json({ success: true, orders: formatted, total: formatted.length });
    }

    if (req.method === 'POST') {
      const { branchId, requestedBy, priority = 'normal', notes, items = [] } = req.body || {};
      if (!branchId) return res.status(400).json({ success: false, error: 'branchId required' });

      const id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const order = await insert('stock_requests', {
        id,
        requesting_branch: branchId,
        requested_by: requestedBy,
        priority,
        notes,
        items: JSON.stringify(items),
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });
      return res.status(201).json({ success: true, order });
    }

    if (req.method === 'PATCH') {
      const { id, status, notes, approvedBy } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'Order id required' });
      const updated = await update('stock_requests', id, { status, notes, approved_by: approvedBy, updated_at: new Date() });
      return res.status(200).json({ success: true, order: updated });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Orders error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
