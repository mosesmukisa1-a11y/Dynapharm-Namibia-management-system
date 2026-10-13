import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne } from './db.js';
import { atomicStockRequest } from './_lib/atomicStockRequest.js';

function normalizeRow(row) {
  if (!row) return null;
  let products = row.products;
  if (typeof products === 'string') try { products = JSON.parse(products); } catch { products = []; }
  let returned_items = row.returned_items;
  if (typeof returned_items === 'string') try { returned_items = JSON.parse(returned_items); } catch { returned_items = []; }
  let distributors = row.distributors;
  if (typeof distributors === 'string') try { distributors = JSON.parse(distributors); } catch { distributors = []; }
  return {
    id: row.id,
    activity_type: row.activity_type,
    location: row.location,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    time: row.time,
    coordinator: row.coordinator,
    target_audience: row.target_audience,
    notes: row.notes,
    status: row.status || 'scheduled',
    branch: row.branch,
    products: products || [],
    returned_items: returned_items || [],
    distributors: distributors || [],
    requires_approval: row.requires_approval || false,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    reconciled_by: row.reconciled_by || null,
    reconciled_at: row.reconciled_at instanceof Date ? row.reconciled_at.toISOString() : row.reconciled_at || null,
    created_by: row.created_by,
    distributor_id: row.distributor_id || null,
    distributor_name: row.distributor_name || null,
    distributor_code: row.distributor_code || null,
    signature: row.signature || null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await getMany('SELECT * FROM field_program_requests ORDER BY date DESC, created_at DESC LIMIT 200');
      return res.json({ success: true, requests: rows.map(normalizeRow).filter(Boolean) });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);

      // Require at least one distributor
      const hasDistributors = Array.isArray(body.distributors) && body.distributors.length > 0;
      const hasDistributorName = body.distributor_name && body.distributor_name.trim();
      if (!hasDistributors && !hasDistributorName) {
        return res.status(400).json({ success: false, error: "Distributor name is required. Please select at least one distributor before submitting." });
      }

      const id = body.id || `FP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await query(
        `INSERT INTO field_program_requests
           (id, activity_type, location, date, time, coordinator, target_audience, notes, status, branch,
            products, returned_items, distributors, requires_approval, created_by,
            distributor_id, distributor_name, distributor_code, signature, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
        [
          id,
          body.activity_type || 'health_screening',
          body.location || '',
          body.date || null,
          body.time || null,
          body.coordinator || null,
          body.target_audience || null,
          body.notes || null,
          body.status || 'pending',
          body.branch || null,
          body.products ? JSON.stringify(body.products) : '[]',
          body.returned_items ? JSON.stringify(body.returned_items) : '[]',
          body.distributors ? JSON.stringify(body.distributors) : '[]',
          body.requires_approval !== undefined ? body.requires_approval : true,
          body.created_by || null,
          body.distributor_id || null,
          body.distributor_name || null,
          body.distributor_code || null,
          body.signature || null,
        ]
      );
      const row = await getOne('SELECT * FROM field_program_requests WHERE id = $1', [id]);
      return res.status(201).json({ success: true, request: normalizeRow(row) });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const id = body.id;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      const existing=await getOne('SELECT * FROM field_program_requests WHERE id=$1 FOR UPDATE',[id]);
      if (!existing) return res.status(404).json({error:'Field request not found'});
      if (['approved','rejected'].includes(body.status)) {
        if (!req.user) return res.status(401).json({error:'Authentication required'});
        if (!['gm','admin','director'].includes(req.user.role)) return res.status(403).json({error:'GM approval access required'});
        if (existing.status===body.status) return res.json({success:true,request:normalizeRow(existing)});
        if (existing.status!=='pending') return res.status(409).json({error:'Field request is already reviewed'});
        body.approved_by=req.user.sub || req.user.id || req.user.username;
        body.approved_at=new Date().toISOString();
      } else if (body.approved_by !== undefined || body.approved_at !== undefined) {
        return res.status(400).json({error:'Review attribution is set by the server'});
      }

      const sets = [];
      const vals = [];
      let idx = 1;
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
      if (body.returned_items !== undefined) { sets.push(`returned_items = $${idx++}`); vals.push(JSON.stringify(body.returned_items)); }
      if (body.distributors !== undefined) { sets.push(`distributors = $${idx++}`); vals.push(JSON.stringify(body.distributors)); }
      if (body.approved_by !== undefined) { sets.push(`approved_by = $${idx++}`); vals.push(body.approved_by); }
      if (body.approved_at !== undefined) { sets.push(`approved_at = $${idx++}`); vals.push(body.approved_at); }
      if (body.reconciled_by !== undefined) { sets.push(`reconciled_by = $${idx++}`); vals.push(body.reconciled_by); }
      if (body.reconciled_at !== undefined) { sets.push(`reconciled_at = $${idx++}`); vals.push(body.reconciled_at); }
      if (body.notes !== undefined) { sets.push(`notes = $${idx++}`); vals.push(body.notes); }
      sets.push(`updated_at = NOW()`);

      if (sets.length > 1) {
        vals.push(id);
        await query(`UPDATE field_program_requests SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
      }

      const row = await getOne('SELECT * FROM field_program_requests WHERE id = $1', [id]);
      return res.json({ success: true, request: normalizeRow(row) });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Field program API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
export default atomicStockRequest(handler);
