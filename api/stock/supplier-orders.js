import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const role = String(req.user.role || '').toLowerCase();
  const operators = new Set(['stock', 'gm', 'general_manager', 'director', 'admin', 'superadmin', 'super_admin']);
  if (!operators.has(role) && !(req.method === 'GET' && ['finance', 'finance_manager', 'mis'].includes(role)))
  return res.status(403).json({ success: false, error: 'Central stock access required' });

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status') || '';
      const conditions = [__qd_registeredPlan("api/stock/supplier-orders.js:17:0")];
      const params = [];
      if (status) {conditions.push(__qd_registeredPlan("api/stock/supplier-orders.js:19:1", [params.length + 1]));params.push(status);}
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/supplier-orders.js:21:2", [__qd_joinPlans(
        conditions, "and")]),
      params);

      return res.status(200).json({ success: true, orders: rows });
    }

    if (req.method === 'POST') {
      const {
        product_name, quantity, days_remaining, daily_rate, priority_label,
        notes, requested_by, requested_by_name, location
      } = req.body || {};

      if (!String(product_name || '').trim() || !Number.isSafeInteger(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ success: false, error: 'Product and positive whole-unit quantity are required' });
      }

      const ref = `SPO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/stock/supplier-orders.js:39:3"),





      [ref, product_name, Number(quantity), days_remaining != null ? Number(days_remaining) : null,
      daily_rate != null ? Number(daily_rate) : null, priority_label || null,
      notes || null, requested_by || null, requested_by_name || null, location || null]);

      return res.status(201).json({ success: true, order: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      const { id, status, notes, submitted_by } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id required' });

      const setClauses = [__qd_registeredPlan("api/stock/supplier-orders.js:55:4")];
      const params = [];
      if (status) {setClauses.push(__qd_registeredPlan("api/stock/supplier-orders.js:57:5", [params.length + 1]));params.push(status);}
      if (notes != null) {setClauses.push(__qd_registeredPlan("api/stock/supplier-orders.js:58:6", [params.length + 1]));params.push(notes);}
      if (submitted_by) {setClauses.push(__qd_registeredPlan("api/stock/supplier-orders.js:59:7", [params.length + 1]));params.push(submitted_by);}
      if (status === 'submitted') {
        setClauses.push(__qd_registeredPlan("api/stock/supplier-orders.js:61:8"));
      }
      params.push(id);
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/stock/supplier-orders.js:65:9", [__qd_joinPlans(
        setClauses, "comma"), params.length]),
      params);

      if (!result.rows.length) return res.status(404).json({ success: false, error: 'Order not found' });
      return res.status(200).json({ success: true, order: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) return res.status(400).json({ success: false, error: 'id required' });
      await __qd_executePlan(query, __qd_registeredPlan("api/stock/supplier-orders.js:76:10"), [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Supplier orders error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}
