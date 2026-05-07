import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';

const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'gm', 'director', 'stock_manager', 'mis', 'finance']);

/**
 * GET /api/stock/request-batches?request_id=<id>
 * GET /api/stock/request-batches?transfer_id=<id>
 *
 * Returns batch info linked to a specific stock request (or transfer) so that:
 *  - The branch receipt modal can pre-populate batch_no and expiry_date.
 *  - The DispatchNote component can enrich dispatch note line items with
 *    the actual batch_no / expiry_date from warehouse_dispatch stock movements.
 *
 * Primary source: warehouse_dispatch stock_movements with reference_id = request_id
 *   (created by the BranchRequestsPanel direct-dispatch flow)
 *
 * Fallback source: stock_transfer_items from transfers whose request_id matches
 *   (created by the OrdersTab GM-approval dispatch flow — batches are pre-resolved
 *   at dispatch time and stored on the transfer items)
 *
 * transfer_id support:
 *   When transfer_id is supplied instead of request_id, the handler first looks up
 *   the linked request_id from stock_transfers, then falls back to querying
 *   stock_movements with reference_id = transfer_id, and finally reads
 *   stock_transfer_items directly for the given transfer_id.
 *
 * Authorization:
 *   - Privileged roles can read any request's batch data.
 *   - Branch-scoped users can only read data for requests whose requesting_branch
 *     matches their allowed branch(es).
 */
export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestId  = (searchParams.get('request_id')  || '').trim();
  const transferId = (searchParams.get('transfer_id') || '').trim();

  if (!requestId && !transferId) {
    return res.status(400).json({ error: 'request_id or transfer_id is required' });
  }

  try {
    const role = (req.user.role || '').toLowerCase();
    const branchScope = getBranchScope(req.user);

    // ── Resolve effective request_id ──────────────────────────────────────────
    // If only transfer_id is provided, try to find the linked stock request.
    let effectiveRequestId = requestId;
    if (!effectiveRequestId && transferId) {
      const transferRow = await getOne(
        `SELECT request_id FROM stock_transfers WHERE id = $1 LIMIT 1`,
        [transferId]
      );
      effectiveRequestId = transferRow?.request_id || null;
    }

    // ── Branch-scope authorization ────────────────────────────────────────────
    if (!PRIVILEGED_ROLES.has(role) && branchScope.enforced && effectiveRequestId) {
      const stockReq = await getOne(
        `SELECT requesting_branch FROM stock_requests WHERE id = $1 LIMIT 1`,
        [effectiveRequestId]
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

    const normaliseMovement = (r, refId) => ({
      id: r.id || null,
      product_name: r.product_name || '',
      batch_no: r.batch_no || null,
      expiry_date: r.expiry_date
        ? (r.expiry_date instanceof Date ? r.expiry_date.toISOString().slice(0, 10) : String(r.expiry_date).slice(0, 10))
        : null,
      quantity: Number(r.quantity || 0),
      source_location: r.source_location || '',
      destination_location: r.destination_location || '',
      reference_id: r.reference_id || refId || null,
    });

    // ── Primary: warehouse_dispatch movements by effective request_id ─────────
    if (effectiveRequestId) {
      const rows = await getMany(
        `SELECT
           id, product_name, batch_no, expiry_date, quantity,
           source_location, destination_location, reference_id, created_at
         FROM stock_movements
         WHERE reference_id = $1
           AND movement_type = 'warehouse_dispatch'
         ORDER BY created_at ASC`,
        [effectiveRequestId]
      );

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          movements: rows.map(r => normaliseMovement(r, effectiveRequestId)),
        });
      }
    }

    // ── Secondary: warehouse_dispatch movements by transfer_id directly ───────
    // Handles the case where the movement was recorded with transfer_id as reference.
    if (transferId && transferId !== effectiveRequestId) {
      const rows2 = await getMany(
        `SELECT
           id, product_name, batch_no, expiry_date, quantity,
           source_location, destination_location, reference_id, created_at
         FROM stock_movements
         WHERE reference_id = $1
           AND movement_type = 'warehouse_dispatch'
         ORDER BY created_at ASC`,
        [transferId]
      );

      if (rows2.length > 0) {
        return res.status(200).json({
          success: true,
          movements: rows2.map(r => normaliseMovement(r, transferId)),
        });
      }
    }

    // ── Fallback A: transfer items linked to this request (GM-approval flow) ──
    // Batches are pre-resolved at dispatch time and stored on stock_transfer_items.
    if (effectiveRequestId) {
      const transferRows = await getMany(
        `SELECT
           sti.product_name, sti.batch_no, sti.expiry_date, sti.quantity,
           st.from_warehouse AS source_location,
           st.to_branch      AS destination_location
         FROM stock_transfer_items sti
         JOIN stock_transfers st ON st.id = sti.transfer_id
         WHERE st.request_id = $1
           AND st.status IN ('pending_approval', 'approved', 'dispatched', 'in_transit', 'received', 'delivered', 'completed')
         ORDER BY sti.created_at ASC`,
        [effectiveRequestId]
      );

      if (transferRows.length > 0) {
        return res.status(200).json({
          success: true,
          movements: transferRows.map(r => normaliseMovement({ ...r, id: null, reference_id: effectiveRequestId }, effectiveRequestId)),
        });
      }
    }

    // ── Fallback B: stock_transfer_items directly by transfer_id ─────────────
    if (transferId) {
      const itemRows = await getMany(
        `SELECT
           sti.product_name, sti.batch_no, sti.expiry_date, sti.quantity,
           st.from_warehouse AS source_location,
           st.to_branch      AS destination_location
         FROM stock_transfer_items sti
         JOIN stock_transfers st ON st.id = sti.transfer_id
         WHERE sti.transfer_id = $1
         ORDER BY sti.created_at ASC`,
        [transferId]
      );

      if (itemRows.length > 0) {
        return res.status(200).json({
          success: true,
          movements: itemRows.map(r => normaliseMovement({ ...r, id: null, reference_id: transferId }, transferId)),
        });
      }
    }

    return res.status(200).json({ success: true, movements: [] });
  } catch (err) {
    console.error('[request-batches] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
