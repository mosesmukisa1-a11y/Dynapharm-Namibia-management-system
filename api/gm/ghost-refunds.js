import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js"; /**
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
import { recomputeLocationBalances, recomputeInventoryBalanceTx, INWARD_TYPES, OUTWARD_TYPES } from '../services/stockEngine.js';
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
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/gm/ghost-refunds.js:38:0"),








      []);

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
      const ghostPrecheck = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/ghost-refunds.js:72:1"),





      [id]);

      if (!ghostPrecheck)
      return res.status(404).json({ success: false, error: 'Ghost row not found or already resolved' });

      if (action === 'write_off') {
        // Lock the row inside the transaction to prevent concurrent write-offs
        // or racing stock deductions from reading a stale quantity.
        let ghostBranchId, ghostProductName, ghostBatchNo, qty;

        await withTransaction(async (client) => {
          // 1. Lock and read the current row state
          const lockResult = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/gm/ghost-refunds.js:90:2"),







          [id]);

          if (lockResult.rowCount === 0) {
            // Already resolved by a concurrent request — treat as a no-op
            return;
          }
          const ghost = lockResult.rows[0];
          ghostBranchId = ghost.branch_id;
          ghostProductName = ghost.product_name;
          ghostBatchNo = ghost.batch_no;
          qty = Number(ghost.quantity || 0);

          // 2. Delete the ghost BIB row
          const delResult = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/gm/ghost-refunds.js:111:3"),

          [id]);

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
            const inwardList = [...INWARD_TYPES];
            const outwardList = [...OUTWARD_TYPES];
            const balRes = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/gm/ghost-refunds.js:135:4"),










            [canonicalBranch, ghost.product_name, inwardList, outwardList, ghost.batch_no || '']);

            const liveClosing = Number(balRes.rows[0]?.live_closing ?? qty);
            const effectiveQty = Math.min(qty, Math.max(0, liveClosing));

            if (effectiveQty > 0) {
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/gm/ghost-refunds.js:152:5"),










              [
              smId,
              ghost.product_name,
              ghost.batch_no || null,
              effectiveQty,
              canonicalBranch,
              id,
              `Ghost refund row written off by GM (${actor}) — no matching expiry-dated batch` + (
              effectiveQty < qty ? ` (capped from ${qty} to ${effectiveQty} — partial deduction already applied)` : ''),
              actor]);



              // ── Atomically update inventory_balances inside this transaction ──
              //
              // Previously the balance recompute ran OUTSIDE the transaction,
              // creating a race window: a concurrent sale that committed between
              // the write-off movement commit and the recompute could push
              // closing_qty negative before the recompute corrected it.
              //
              // By calling recomputeInventoryBalanceTx here, the movement insert
              // and the inventory_balances upsert are part of the SAME database
              // transaction.  The per-key advisory lock inside that function
              // serialises any concurrent recompute that arrives during this
              // window, so the balance is always consistent with the committed
              // movements the moment this transaction commits.
              await recomputeInventoryBalanceTx(client, {
                locationType: 'branch',
                locationId: canonicalBranch,
                productName: ghost.product_name,
                batchNo: ghost.batch_no || ''
              });
            }
          }
        });

        // If a concurrent request already resolved the row, return 409
        if (!ghostBranchId) {
          return res.status(409).json({ success: false, error: 'Ghost row was already resolved by a concurrent request' });
        }

        return res.json({
          success: true,
          message: `Ghost row ${id} written off — ${qty} units of "${ghostProductName}" removed from ${ghostBranchId}`
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
        const updResult = await __qd_executePlan(query, __qd_registeredPlan("api/gm/ghost-refunds.js:237:6"),





        [id]);

        if (updResult.rowCount === 0) {
          return res.status(409).json({ success: false, error: 'Ghost row was already resolved' });
        }
        const ghost = await __qd_executePlan(getOne, __qd_registeredPlan("api/gm/ghost-refunds.js:248:7"),

        [id]);

        const qty = Number(ghost?.quantity || 0);
        return res.json({
          success: true,
          message: `Ghost row ${id} confirmed as legitimate no-expiry return — ${qty} units of "${ghost?.product_name}" kept in ${ghost?.branch_id}`
        });
      }
    } catch (err) {
      console.error('[gm/ghost-refunds] PATCH error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
