import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, insert, update } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const conditions = [__qd_registeredPlan("api/stock/edit-requests.js:13:0")];
      const params = [];
      if (status) {conditions.push(__qd_registeredPlan("api/stock/edit-requests.js:15:1", [params.length + 1]));params.push(status);}

      const requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/edit-requests.js:18:2", [__qd_joinPlans(
        conditions, "and")]),
      params);


      return res.status(200).json({ success: true, requests, total: requests.length });
    }

    if (req.method === 'POST') {
      const { productName, batchNo, fieldName, oldValue, newValue, reason, requestedBy } = req.body || {};
      if (!productName || !fieldName || !reason) return res.status(400).json({ success: false, error: 'productName, fieldName, reason required' });

      const id = `ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const record = await insert('stock_adjustments', {
        id,
        product_name: productName,
        batch_no: batchNo,
        field_name: fieldName,
        old_value: String(oldValue || ''),
        new_value: String(newValue || ''),
        reason,
        requested_by: requestedBy,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });
      return res.status(201).json({ success: true, request: record });
    }

    if (req.method === 'PATCH') {
      const { id, status, approvedBy } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      const updated = await update('stock_adjustments', id, { status, approved_by: approvedBy, updated_at: new Date() });
      return res.status(200).json({ success: true, request: updated });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Edit requests error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
