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
 *   When transfer_id is supplied, the handler resolves the linked request_id and
 *   to_branch from stock_transfers in a single query. Branch-scope authorization
 *   then uses request.requesting_branch (if available) or transfer.to_branch
 *   (when no request is linked) to validate access.
 *
 * Authorization:
 *   - Privileged roles can read any request's batch data.
 *   - Branch-scoped users:
 *     - request_id path: requesting_branch of the stock_request must match
 *     - transfer_id path (linked request): same check via effectiveRequestId
 *     - transfer_id path (no linked request): to_branch of the stock_transfer
 *       must match; if transfer not found → 403
 */

/** Normalize a branch string to a stable key for comparison. */
function branchKey(b) {
  return (b || '').toLowerCase().replace(/\s+/g, '_');
}

/** True when the branch string matches any of the user's allowed branches. */
function isBranchAllowed(branch, allowedBranches) {
  const k = branchKey(branch);
  const kAlt = k.endsWith('_branch') ? k : k + '_branch';
  const kStripped = k.replace(/_branch$/, '');
  return allowedBranches.some(b => {
    const bn = branchKey(b);
    return bn === k || bn === kAlt || bn === kStripped;
  });
}

/**
 * For any row that has a batch_no but no expiry_date, look up the expiry from
 * stock_batches (primary) then supplier_imports (fallback).
 * Returns a map: batch_no → expiry_date string (YYYY-MM-DD).
 */
async function resolveExpiryDates(rows) {
  const missing = [...new Set(
    rows.filter(r => r.batch_no && !r.expiry_date).map(r => r.batch_no)
  )];
  if (missing.length === 0) return {};

  const map = {};
  try {
    // Primary: stock_batches (the FEFO ledger)
    const batchRows = await getMany(
      `SELECT batch_no, expiry_date
       FROM stock_batches
       WHERE batch_no = ANY($1::text[])
         AND expiry_date IS NOT NULL
       ORDER BY created_at DESC`,
      [missing]
    );
    for (const r of batchRows) {
      if (r.batch_no && r.expiry_date && !map[r.batch_no]) {
        map[r.batch_no] = r.expiry_date instanceof Date
          ? r.expiry_date.toISOString().slice(0, 10)
          : String(r.expiry_date).slice(0, 10);
      }
    }

    // Fallback: supplier_imports (user-entered batch data)
    const stillMissing = missing.filter(bn => !map[bn]);
    if (stillMissing.length > 0) {
      const siRows = await getMany(
        `SELECT batch_no, expiry_date
         FROM supplier_imports
         WHERE batch_no = ANY($1::text[])
           AND expiry_date IS NOT NULL
         ORDER BY created_at DESC`,
        [stillMissing]
      );
      for (const r of siRows) {
        if (r.batch_no && r.expiry_date && !map[r.batch_no]) {
          map[r.batch_no] = r.expiry_date instanceof Date
            ? r.expiry_date.toISOString().slice(0, 10)
            : String(r.expiry_date).slice(0, 10);
        }
      }
    }
  } catch (e) {
    console.warn('[request-batches] expiry-date fallback lookup failed:', e.message);
  }
  return map;
}

function normaliseMovement(r, refId, expiryMap = {}) {
  const expiryRaw = r.expiry_date
    ? (r.expiry_date instanceof Date ? r.expiry_date.toISOString().slice(0, 10) : String(r.expiry_date).slice(0, 10))
    : null;
  const expiry = expiryRaw || (r.batch_no ? (expiryMap[r.batch_no] || null) : null);
  return {
    id: r.id || null,
    product_name: r.product_name || '',
    batch_no: r.batch_no || null,
    expiry_date: expiry,
    quantity: Number(r.quantity || 0),
    source_location: r.source_location || '',
    destination_location: r.destination_location || '',
    reference_id: r.reference_id || refId || null,
  };
}

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
    const isPrivileged = PRIVILEGED_ROLES.has(role);

    // ── Resolve effective request_id and transfer destination ─────────────────
    let effectiveRequestId = requestId;
    let transferToBranch = null;

    if (transferId) {
      const transferRow = await getOne(
        `SELECT request_id, to_branch FROM stock_transfers WHERE id = $1 LIMIT 1`,
        [transferId]
      );
      if (transferRow) {
        if (!effectiveRequestId && transferRow.request_id) {
          effectiveRequestId = transferRow.request_id;
        }
        transferToBranch = transferRow.to_branch || null;
      }
    }

    // ── Branch-scope authorization ────────────────────────────────────────────
    if (!isPrivileged && branchScope.enforced) {
      if (effectiveRequestId) {
        const stockReq = await getOne(
          `SELECT requesting_branch FROM stock_requests WHERE id = $1 LIMIT 1`,
          [effectiveRequestId]
        );
        if (!stockReq) {
          return res.status(200).json({ success: true, movements: [] });
        }
        if (!isBranchAllowed(stockReq.requesting_branch, branchScope.branches)) {
          return res.status(403).json({ error: 'Access denied: request does not belong to your branch' });
        }
      } else if (transferId) {
        if (!transferToBranch) {
          return res.status(403).json({ error: 'Access denied: transfer not found or has no destination branch' });
        }
        if (!isBranchAllowed(transferToBranch, branchScope.branches)) {
          return res.status(403).json({ error: 'Access denied: transfer does not belong to your branch' });
        }
      }
    }

    // ── Primary: warehouse_dispatch / country_release movements by effective request_id ───
    // country_release is used for country-stock → warehouse transfers (#64)
    if (effectiveRequestId) {
      const rows = await getMany(
        `SELECT
           id, product_name, batch_no, expiry_date, quantity,
           source_location, destination_location, reference_id, created_at
         FROM stock_movements
         WHERE reference_id = $1
           AND movement_type IN ('warehouse_dispatch', 'country_release')
         ORDER BY created_at ASC`,
        [effectiveRequestId]
      );

      if (rows.length > 0) {
        const expiryMap = await resolveExpiryDates(rows);
        return res.status(200).json({
          success: true,
          movements: rows.map(r => normaliseMovement(r, effectiveRequestId, expiryMap)),
        });
      }
    }

    // ── Secondary: warehouse_dispatch / country_release movements by transfer_id ──────────
    if (transferId && transferId !== effectiveRequestId) {
      const rows2 = await getMany(
        `SELECT
           id, product_name, batch_no, expiry_date, quantity,
           source_location, destination_location, reference_id, created_at
         FROM stock_movements
         WHERE reference_id = $1
           AND movement_type IN ('warehouse_dispatch', 'country_release')
         ORDER BY created_at ASC`,
        [transferId]
      );

      if (rows2.length > 0) {
        const expiryMap = await resolveExpiryDates(rows2);
        return res.status(200).json({
          success: true,
          movements: rows2.map(r => normaliseMovement(r, transferId, expiryMap)),
        });
      }
    }

    // ── Fallback A: transfer items linked to this request (GM-approval flow) ──
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
        const expiryMap = await resolveExpiryDates(transferRows);
        return res.status(200).json({
          success: true,
          movements: transferRows.map(r => normaliseMovement(
            { ...r, id: null, reference_id: effectiveRequestId }, effectiveRequestId, expiryMap
          )),
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
        const expiryMap = await resolveExpiryDates(itemRows);
        return res.status(200).json({
          success: true,
          movements: itemRows.map(r => normaliseMovement(
            { ...r, id: null, reference_id: transferId }, transferId, expiryMap
          )),
        });
      }
    }

    return res.status(200).json({ success: true, movements: [] });
  } catch (err) {
    console.error('[request-batches] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
