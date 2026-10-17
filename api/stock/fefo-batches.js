import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

/**
 * GET /api/stock/fefo-batches
 * Query params:
 *   product   - product name (required)
 *   location  - source warehouse/location (required)
 *   qty       - total quantity needed (optional, returns all batches if omitted)
 *
 * Returns an array of FEFO-ordered batches with allocated quantities:
 *   [{ batch_no, expiry_date, available_qty, allocated_qty }]
 *
 * If qty is supplied, the response only includes as many batches as needed
 * to cover the requested quantity, with each batch's allocated_qty capped
 * at its available_qty.  If total available < qty, a `shortfall` field is
 * included in the response body.
 */
export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const product = (searchParams.get('product') || '').trim();
  const location = (searchParams.get('location') || '').trim();
  const qtyParam = searchParams.get('qty');
  const neededQty = qtyParam ? Number(qtyParam) : null;

  if (!product) return res.status(400).json({ error: 'product is required' });
  if (!location) return res.status(400).json({ error: 'location is required' });

  try {
    const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/fefo-batches.js:35:0"),










    [location, product]);


    if (!rows.length) {
      return res.status(200).json({ batches: [], shortfall: neededQty ?? 0 });
    }

    if (neededQty === null || neededQty <= 0) {
      const batches = rows.map((r) => ({
        batch_no: r.batch_no || null,
        expiry_date: r.expiry_date ?
        r.expiry_date instanceof Date ? r.expiry_date.toISOString().slice(0, 10) : String(r.expiry_date).slice(0, 10) :
        null,
        available_qty: Number(r.available_qty),
        allocated_qty: Number(r.available_qty)
      }));
      return res.status(200).json({ batches, shortfall: 0 });
    }

    let remaining = neededQty;
    const batches = [];

    for (const r of rows) {
      if (remaining <= 0) break;
      const avail = Number(r.available_qty);
      const allocated = Math.min(remaining, avail);
      batches.push({
        batch_no: r.batch_no || null,
        expiry_date: r.expiry_date ?
        r.expiry_date instanceof Date ? r.expiry_date.toISOString().slice(0, 10) : String(r.expiry_date).slice(0, 10) :
        null,
        available_qty: avail,
        allocated_qty: allocated
      });
      remaining -= allocated;
    }

    return res.status(200).json({ batches, shortfall: remaining > 0 ? remaining : 0 });
  } catch (err) {
    console.error('[fefo-batches] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
