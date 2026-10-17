import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { query } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { lifecycleSchema, fail } from '../services/stockCostLayers.js';

async function handler(req, res) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method === 'GET') return res.json({ success: true, rows: (await __qd_executePlan(query, __qd_registeredPlan("api/stock/product-packs.js:7:0"), [])).rows });
  if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!['admin', 'superadmin', 'super_admin', 'stock', 'stock_manager', 'gm'].includes(String(req.user.role).toLowerCase()))
  return res.status(403).json({ success: false, error: 'Stock Manager access required' });
  const { productName, baseUnit, packs } = req.body || {};
  const name = String(productName || '').trim().toLowerCase(),base = String(baseUnit || '').trim().toLowerCase();
  if (!name || !base || !Array.isArray(packs)) fail('Product, base unit and explicit packs are required');
  const normalized = packs.map((p) => ({ unit: String(p.unit || '').trim().toLowerCase(), factor: Number(p.factor), barcode: String(p.barcode || '').trim() || null }));
  if (normalized.some((p) => !p.unit || p.unit === base && p.factor !== 1 || !Number.isSafeInteger(p.factor) || p.factor <= 0) ||
  new Set(normalized.map((p) => p.unit)).size !== normalized.length) fail('Each pack needs a unique unit and positive whole base-unit factor');
  // Serialize configuration to prevent two products claiming one barcode.
  await __qd_executePlan(query, __qd_registeredPlan("api/stock/product-packs.js:18:1"), []);
  const others = (await __qd_executePlan(query, __qd_registeredPlan("api/stock/product-packs.js:19:2"), [name])).rows;
  const codes = normalized.map((p) => p.barcode).filter(Boolean);
  if (new Set(codes).size !== codes.length || others.some((row) => row.packs.some((p) => codes.includes(p.barcode))))
  fail('A pack barcode must identify exactly one product and unit');
  if (codes.length && (await __qd_executePlan(query, __qd_registeredPlan("api/stock/product-packs.js:23:3"),
  [codes])).rowCount)
  fail('Pack barcode conflicts with an existing product or batch barcode');
  await __qd_executePlan(query, __qd_registeredPlan("api/stock/product-packs.js:26:4"),
  [name, base, JSON.stringify(normalized)]);
  return res.json({ success: true, productName: name, baseUnit: base, packs: normalized });
}
export default atomicStockRequest(handler);
