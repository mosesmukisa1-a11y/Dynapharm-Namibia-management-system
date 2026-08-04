/**
 * GET  /api/gm/ghost-refunds
 *   Lists all BIB-RFND-* rows with NULL expiry_date that were left as orphans
 *   by the ghost-cleanup migration (no matching expiry-dated batch found).
 *   Requires role: gm | admin | director
 *
 * PATCH /api/gm/ghost-refunds
 *   { id, action: 'write_off' | 'confirm_no_expiry' }
 *   resolved_by is derived from the authenticated session; do NOT pass it in
 *   the request body (it is ignored if present).
 *   Requires role: gm | admin | director
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query, withTransaction } from '../db.js';
import { recomputeLocationBalances, INWARD_TYPES, OUTWARD_TYPES } from '../services/stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

const ALLOWED_ROLES = new Set(['gm', 'admin', 'director', 'general_manager']);

function requireGmRole(req, res) {
  const role = (req.user?.role || '').toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    res.status(403).json({ success: false, error: 'Access denied — GM or admin role required' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: list all orphan ghost rows ─────────────────────────────────────
  if (req.method === 'GET') {
    if (!requireGmRole(req, res)) return;
    try {
      const rows = await getMany(
        `SELECT id, branch_id, product_name, batch_no, quantity, unit_price,
                created_at, updated_at
         FROM branch_inventory_batches
         WHERE id LIKE 'BIB-RFND-%'
           AND expiry_date IS NULL
           AND source_warehouse IS NULL
         ORDER BY created_at DESC
         LIMIT 500`,
        []
      );
      return res.json({ success: true, rows });
    } catch (err) {
      console.error('[gm/ghost-refunds] GET error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── PATCH: resolve one ghost row ─────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!requireGmRole(req, res)) return;
    try {
      const { id, action } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ success: false, error: 'id and action are required' });
      if (!['write_off', 'confirm_no_expiry'].includes(action))
        return res.status(400).json({ success: false, error: 'action must be write_off or confirm_no_expiry' });

      // Derive actor from authenticated session — never trust the request body
      const actor = (req.user?.fullName || req.user?.full_name || req.user?.name || req.user?.sub || 'GM').trim();

      // ── Validate the row exists before entering the transaction ────────────
      // (The FOR UPDATE lock inside the transaction is the authoritative check;
      //  this early read is only for a fast 404 before we open a transaction.)
      const ghostPrecheck = await getOne(
        `SELECT id FROM branch_inventory_batches
         WHERE id = $1
           AND id LIKE 'BIB-RFND-%'
           AND expiry_date IS NULL
           AND source_warehouse IS NULL`,
        [id]
      );
      if (!ghostPrecheck)
        return res.status(404).json({ success: false, error: 'Ghost row not found or already resolved' });

      if (action === 'write_off') {
        // Lock the row inside the transaction to prevent concurrent write-offs
        // or racing stock deductions from reading a stale quantity.
        let ghostBranchId, ghostProductName, ghostBatchNo, qty;

        await withTransaction(async (client) => {
          // 1. Lock and read the current row state
          const lockResult = await client.query(
            `SELECT id, branch_id, product_name, batch_no, quantity
             FROM branch_inventory_batches
             WHERE id = $1
               AND id LIKE 'BIB-RFND-%'
               AND expiry_date IS NULL
               AND source_warehouse IS NULL
             FOR UPDATE`,
            [id]
          );
          if (lockResult.rowCount === 0) {
            // Already resolved by a concurrent request — treat as a no-op
            return;
          }
          const ghost = lockResult.rows[0];
          ghostBranchId   = ghost.branch_id;
          ghostProductName = ghost.product_name;
          ghostBatchNo    = ghost.batch_no;
          qty             = Number(ghost.quantity || 0);

          // 2. Delete the ghost BIB row
          const delResult = await client.query(
            `DELETE FROM branch_inventory_batches WHERE id = $1`,
            [id]
          );
          if (delResult.rowCount === 0) {
            // Another request already deleted it — abort movement insert
            ghostBranchId = null;
            return;
          }

          // 3. Record a write-off stock_movement for audit / recompute
          //    Only insert if the row was actually deleted in this transaction.
          if (qty > 0) {
            const smId = `SM-WOFF-GHOST-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const canonicalBranch = normalizeBranchSlug(ghost.branch_id) || ghost.branch_id;

            // ── Guard: cap write-off qty at the current live balance ──────────
            // If the ghost quantity was already partially (or fully) deducted by
            // a concurrent sale or prior adjustment, writing off the full ghost
            // qty would push the balance negative.  Compute the movement-backed
            // balance for this branch/product/batch BEFORE the write-off and cap
            // the deduction to avoid a negative closing_qty.
            const inwardList  = [...INWARD_TYPES];
            const outwardList = [...OUTWARD_TYPES];
            const balRes = await client.query(
              `SELECT
                 COALESCE(SUM(CASE WHEN destination_location = $1
                                    AND movement_type = ANY($3::text[]) THEN quantity ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN source_location = $1
                                      AND movement_type = ANY($4::text[]) THEN quantity ELSE 0 END), 0)
                 AS live_closing
               FROM stock_movements
               WHERE status IN ('posted', 'approved')
                 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
                 AND COALESCE(batch_no, '') = $5`,
              [canonicalBranch, ghost.product_name, inwardList, outwardList, ghost.batch_no || '']
            );
            const liveClosing = Number(balRes.rows[0]?.live_closing ?? qty);
            const effectiveQty = Math.min(qty, Math.max(0, liveClosing));

            if (effectiveQty > 0) {
              await client.query(
                `INSERT INTO stock_movements
                   (id, product_name, batch_no, expiry_date, quantity, movement_type,
                    source_location, source_location_type,
                    destination_location, destination_location_type,
                    reference_id, notes, created_by, status,
                    movement_date, created_at, updated_at)
                 VALUES ($1,$2,$3,NULL,$4,'write_off',
                         $5,'branch',
                         'disposed','external',
                         $6,$7,$8,'posted',NOW(),NOW(),NOW())`,
                [
                  smId,
                  ghost.product_name,
                  ghost.batch_no || null,
                  effectiveQty,
                  canonicalBranch,
                  id,
                  `Ghost refund row written off by GM (${actor}) — no matching expiry-dated batch` +
                    (effectiveQty < qty ? ` (capped from ${qty} to ${effectiveQty} — partial deduction already applied)` : ''),
                  actor,
                ]
              );
            }
          }
        });

        // If a concurrent request already resolved the row, return 409
        if (!ghostBranchId) {
          return res.status(409).json({ success: false, error: 'Ghost row was already resolved by a concurrent request' });
        }

        // Recompute branch balances — await so the write-off is reflected
        // before we return success.  Signature: recomputeLocationBalances(locationType, locationId)
        const canonBranch = normalizeBranchSlug(ghostBranchId) || ghostBranchId;
        try {
          await recomputeLocationBalances('branch', canonBranch);
        } catch (recomputeErr) {
          console.error('[gm/ghost-refunds] recomputeLocationBalances error:', recomputeErr.message);
          // Non-fatal: the movement is committed; the balance will reconcile on
          // the next scheduled recompute.
        }

        return res.json({
          success: true,
          message: `Ghost row ${id} written off — ${qty} units of "${ghostProductName}" removed from ${ghostBranchId}`,
        });
      }

      if (action === 'confirm_no_expiry') {
        // Mark as confirmed: update source_warehouse to a sentinel value so
        // the ghost-cleanup migration ignores it in future runs, and the GM
        // report no longer lists it.  The row stays in branch inventory with
        // its NULL expiry (genuinely expiry-free product).
        //
        // ── Why this does NOT inflate inventory ──────────────────────────────
        // Ghost rows were created because the pre-fix refund code tried
        // UPDATE WHERE expiry_date IS NULL and found no matching row (the real
        // batch has a non-NULL expiry), then fell through to an INSERT of the
        // ghost with the refund qty.  The canonical expiry-dated batch was
        // NEVER updated — the refund qty was not added to it.
        //
        // So at the moment of confirm_no_expiry:
        //   canonical batch qty = pre-sale qty minus the original sale deduction
        //   ghost row qty       = the returned units from that sale
        //   total               = (pre-sale qty − sold) + returned = correct
        //
        // For products that genuinely have no expiry: the ghost IS the correct
        // refund entry and no canonical expiry-dated batch exists, so there is
        // also no double-count.
        //
        // In both cases, canonical_qty + ghost_qty equals the correct on-hand
        // total and confirm_no_expiry does not over-count stock.
        // ─────────────────────────────────────────────────────────────────────
        //
        // Use a conditional UPDATE so a duplicate request is idempotent.
        const updResult = await query(
          `UPDATE branch_inventory_batches
           SET source_warehouse = 'refund_confirmed',
               updated_at       = NOW()
           WHERE id = $1
             AND source_warehouse IS NULL`,
          [id]
        );
        if (updResult.rowCount === 0) {
          return res.status(409).json({ success: false, error: 'Ghost row was already resolved' });
        }
        const ghost = await getOne(
          `SELECT branch_id, product_name, quantity FROM branch_inventory_batches WHERE id = $1`,
          [id]
        );
        const qty  = Number(ghost?.quantity || 0);
        return res.json({
          success: true,
          message: `Ghost row ${id} confirmed as legitimate no-expiry return — ${qty} units of "${ghost?.product_name}" kept in ${ghost?.branch_id}`,
        });
      }
    } catch (err) {
      console.error('[gm/ghost-refunds] PATCH error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
