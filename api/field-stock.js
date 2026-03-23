import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;

    if (req.method === 'GET') {
      const id = searchParams.get('id');
      if (id) {
        const row = await getOne('SELECT * FROM field_stock WHERE id = $1', [id]);
        if (!row) return res.status(404).json({ error: 'Field stock record not found' });
        return res.json(row);
      }
      const officer = searchParams.get('officer');
      const product = searchParams.get('product');
      const status = searchParams.get('status');
      const limit = Number(searchParams.get('limit')) || 500;

      let sql = 'SELECT * FROM field_stock';
      const conditions = [];
      const params = [];

      if (officer) {
        params.push(`%${officer}%`);
        conditions.push(`officer_name ILIKE $${params.length}`);
      }
      if (product) {
        params.push(`%${product}%`);
        conditions.push(`product_name ILIKE $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }

      if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY created_at DESC';
      params.push(limit);
      sql += ` LIMIT $${params.length}`;

      const rows = await getMany(sql, params);
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const id = `FS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const qtyIssued = Number(body.quantity_issued || body.quantityIssued || 0);

      const result = await query(
        `INSERT INTO field_stock
          (id, officer_name, team_name, product_name, product_id, batch_no, expiry_date,
           quantity_issued, quantity_returned, quantity_sold, quantity_used, balance,
           origin_location, origin_type, issue_date, status, notes, created_by, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          id,
          body.officer_name || body.officerName || '',
          body.team_name || body.teamName || null,
          body.product_name || body.productName || '',
          body.product_id || body.productId || null,
          body.batch_no || body.batchNo || null,
          body.expiry_date || body.expiryDate || null,
          qtyIssued, qtyIssued,
          body.origin_location || body.originLocation || '',
          body.origin_type || body.originType || 'warehouse',
          body.issue_date || body.issueDate || new Date().toISOString().slice(0, 10),
          'issued',
          body.notes || null,
          body.created_by || body.createdBy || null,
          body.metadata ? JSON.stringify(body.metadata) : null,
        ]
      );

      const movId = `MOV-FS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO stock_movements
          (id, product_name, product_id, batch_no, expiry_date, quantity, movement_type,
           source_location, destination_location, reference_id, notes, created_by, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'field_issue',$7,$8,$9,$10,$11,'completed',NOW(),NOW())`,
        [
          movId,
          body.product_name || body.productName || '',
          body.product_id || body.productId || null,
          body.batch_no || body.batchNo || null,
          body.expiry_date || body.expiryDate || null,
          qtyIssued,
          body.origin_location || body.originLocation || '',
          `field:${body.officer_name || body.officerName || 'unknown'}`,
          id,
          `Field issue to ${body.officer_name || body.officerName || 'unknown'}`,
          body.created_by || body.createdBy || null,
        ]
      );

      return res.status(201).json(result.rows[0]);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id is required' });

      const updatePayload = { ...body };
      delete updatePayload.id;
      if (updatePayload.officerName !== undefined) { updatePayload.officer_name = updatePayload.officerName; delete updatePayload.officerName; }
      if (updatePayload.teamName !== undefined) { updatePayload.team_name = updatePayload.teamName; delete updatePayload.teamName; }
      if (updatePayload.productName !== undefined) { updatePayload.product_name = updatePayload.productName; delete updatePayload.productName; }
      if (updatePayload.batchNo !== undefined) { updatePayload.batch_no = updatePayload.batchNo; delete updatePayload.batchNo; }
      if (updatePayload.expiryDate !== undefined) { updatePayload.expiry_date = updatePayload.expiryDate; delete updatePayload.expiryDate; }
      if (updatePayload.quantityIssued !== undefined) { updatePayload.quantity_issued = updatePayload.quantityIssued; delete updatePayload.quantityIssued; }
      if (updatePayload.quantityReturned !== undefined) { updatePayload.quantity_returned = updatePayload.quantityReturned; delete updatePayload.quantityReturned; }
      if (updatePayload.quantitySold !== undefined) { updatePayload.quantity_sold = updatePayload.quantitySold; delete updatePayload.quantitySold; }
      if (updatePayload.quantityUsed !== undefined) { updatePayload.quantity_used = updatePayload.quantityUsed; delete updatePayload.quantityUsed; }
      if (updatePayload.originLocation !== undefined) { updatePayload.origin_location = updatePayload.originLocation; delete updatePayload.originLocation; }
      if (updatePayload.metadata && typeof updatePayload.metadata === 'object') { updatePayload.metadata = JSON.stringify(updatePayload.metadata); }

      if (updatePayload.quantity_returned !== undefined || updatePayload.quantity_sold !== undefined || updatePayload.quantity_used !== undefined) {
        const existing = await getOne('SELECT * FROM field_stock WHERE id = $1', [id]);
        if (existing) {
          const issued = Number(existing.quantity_issued || 0);
          const returned = Number(updatePayload.quantity_returned ?? existing.quantity_returned ?? 0);
          const sold = Number(updatePayload.quantity_sold ?? existing.quantity_sold ?? 0);
          const used = Number(updatePayload.quantity_used ?? existing.quantity_used ?? 0);
          updatePayload.balance = Math.max(0, issued - returned - sold - used);
          if (updatePayload.balance <= 0) updatePayload.status = 'closed';
        }
      }

      const result = await update('field_stock', id, updatePayload, 'id');
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id is required' });
      await remove('field_stock', id, 'id');
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Field stock API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
