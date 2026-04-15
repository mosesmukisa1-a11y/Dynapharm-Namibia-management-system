import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status') || '';
      const conditions = ['1=1'];
      const params = [];
      if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
      const rows = await getMany(
        `SELECT * FROM supplier_purchase_orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
        params
      );
      return res.status(200).json({ success: true, orders: rows });
    }

    if (req.method === 'POST') {
      const {
        product_name, quantity, days_remaining, daily_rate, priority_label,
        notes, requested_by, requested_by_name, location
      } = req.body || {};

      if (!product_name || !quantity) {
        return res.status(400).json({ success: false, error: 'product_name and quantity are required' });
      }

      const ref = `SPO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const result = await query(
        `INSERT INTO supplier_purchase_orders
          (order_ref, product_name, quantity_ordered, days_remaining, daily_rate,
           priority_label, notes, requested_by, requested_by_name, location, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',NOW(),NOW())
         RETURNING *`,
        [ref, product_name, Number(quantity), days_remaining != null ? Number(days_remaining) : null,
         daily_rate != null ? Number(daily_rate) : null, priority_label || null,
         notes || null, requested_by || null, requested_by_name || null, location || null]
      );
      return res.status(201).json({ success: true, order: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      const { id, status, notes, submitted_by } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id required' });

      const setClauses = ['updated_at = NOW()'];
      const params = [];
      if (status)       { setClauses.push(`status = $${params.length+1}`);       params.push(status); }
      if (notes != null){ setClauses.push(`notes = $${params.length+1}`);        params.push(notes); }
      if (submitted_by) { setClauses.push(`submitted_by = $${params.length+1}`); params.push(submitted_by); }
      if (status === 'submitted') {
        setClauses.push(`submitted_at = NOW()`);
      }
      params.push(id);
      const result = await query(
        `UPDATE supplier_purchase_orders SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!result.rows.length) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(200).json({ success: true, order: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      await query(`DELETE FROM supplier_purchase_orders WHERE id = $1 AND status = 'draft'`, [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Supplier orders error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
