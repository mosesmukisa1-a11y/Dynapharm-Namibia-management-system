import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'gm', 'director', 'stock_manager', 'mis', 'finance']);

/**
 * GET /api/stock/request-batches?request_id=<id>
 *
 * Returns warehouse_dispatch stock movements linked to a specific stock request
 * so the branch receipt modal can pre-populate batch_no and expiry_date.
 *
 * Authorization:
 *   - Privileged roles (admin, super_admin, gm, director, stock_manager, mis, finance)
 *     can read any request's batch movements.
 *   - Branch-scoped users can only read batch movements for requests whose
 *     requesting_branch matches their allowed branch(es).
 */
export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestId = (searchParams.get('request_id') || '').trim();

  if (!requestId) return res.status(400).json({ error: 'request_id is required' });

  try {
    const role = (req.user.role || '').toLowerCase();
    const branchScope = getBranchScope(req.user);

    if (!PRIVILEGED_ROLES.has(role) && branchScope.enforced) {
      // Branch-scoped user — verify the request belongs to one of their branches
      const stockReq = await getOne(
        `SELECT requesting_branch FROM stock_requests WHERE id = $1 LIMIT 1`,
        [requestId]
      );
      if (!stockReq) {
        return res.status(200).json({ success: true, movements: [] });
      }
      const reqBranch = (stockReq.requesting_branch || '').toLowerCase().replace(/\s+/g, '_');
      const reqBranchAlt = reqBranch.endsWith('_branch') ? reqBranch : reqBranch + '_branch';
      const reqBranchStripped = reqBranch.replace(/_branch$/, '');
      const allowed = branchScope.branches.some(b => {
        const bn = b.toLowerCase().replace(/\s+/g, '_');
        return bn === reqBranch || bn === reqBranchAlt || bn === reqBranchStripped;
      });
      if (!allowed) {
        return res.status(403).json({ error: 'Access denied: request does not belong to your branch' });
      }
    }

    const rows = await getMany(
      `SELECT
         id,
         product_name,
         batch_no,
         expiry_date,
         quantity,
         source_location,
         destination_location,
         reference_id,
         created_at
       FROM stock_movements
       WHERE reference_id = $1
         AND movement_type = 'warehouse_dispatch'
       ORDER BY created_at ASC`,
      [requestId]
    );

    const movements = rows.map(r => ({
      id: r.id,
      product_name: r.product_name || '',
      batch_no: r.batch_no || null,
      expiry_date: r.expiry_date
        ? (r.expiry_date instanceof Date ? r.expiry_date.toISOString().slice(0, 10) : String(r.expiry_date).slice(0, 10))
        : null,
      quantity: Number(r.quantity || 0),
      source_location: r.source_location || '',
      destination_location: r.destination_location || '',
      reference_id: r.reference_id || requestId,
    }));

    return res.status(200).json({ success: true, movements });
  } catch (err) {
    console.error('[request-batches] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
