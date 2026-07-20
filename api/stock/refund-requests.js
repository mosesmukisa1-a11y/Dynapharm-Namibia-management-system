import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query, withTransaction } from '../db.js';
import { generateBatId } from '../_lib/activityCapture.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const url    = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const status = url.searchParams.get('status')    || '';
      const branch = url.searchParams.get('branch_id') || '';

      const conds = []; const params = [];
      if (status) { params.push(status); conds.push(`status = $${params.length}`); }
      if (branch) {
        params.push(branch.toLowerCase().replace(/ /g, '_'));
        conds.push(`LOWER(REPLACE(branch_id,' ','_')) = $${params.length}`);
      }

      const rows = await getMany(
        `SELECT * FROM branch_refund_requests
         ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
         ORDER BY created_at DESC LIMIT 500`,
        params
      );
      return res.json({ success: true, requests: rows });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, action, approved_by, rejection_reason } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ success: false, error: 'id and action are required' });

      const refund = await getOne('SELECT * FROM branch_refund_requests WHERE id = $1', [id]);
      if (!refund) return res.status(404).json({ success: false, error: 'Refund request not found' });
      if (refund.status !== 'pending')
        return res.status(400).json({ success: false, error: 'Request has already been processed' });

      if (action === 'approve') {
        const now      = new Date();
        const movId    = `RFND-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        const smId     = `SM-RFND-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        const batId    = generateBatId();
        const qty      = parseFloat(refund.quantity);
        const unitDp   = parseFloat(refund.unit_price);
        const dpTotal  = parseFloat(refund.refund_amount);
        const branchId = refund.branch_id;
        const product  = refund.product_name;
        const batchNo  = refund.batch_no || '';
        const approver = approved_by || 'Stock Manager';
        const today    = now.toISOString().slice(0, 10);

        await withTransaction(async (client) => {
          // ── 1. branch_inventory_movements — financial refund record ──────────
          await client.query(
            `INSERT INTO branch_inventory_movements
               (id, branch_id, type, product_name, batch_no, quantity, unit_price,
                reference, notes, created_by, created_at)
             VALUES ($1,$2,'refund_return',$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [movId, branchId, product, batchNo || null, qty, unitDp,
             refund.id, `Refund approved — ${refund.reason}`, approver]
          );

          // ── 2. branch_activity_transactions — reversal record ────────────────
          await client.query(
            `INSERT INTO branch_activity_transactions
               (id, branch_id, branch_name, client_name, client_type,
                service_date, service_time, activity_type, workflow_source,
                form_reference_id, product_total_dp, product_total_cp, total_qty,
                grand_total, payment_status, payment_method, stock_impact,
                stock_status, prescription_status, consultation_status,
                reporting_status, captured_by, created_at, updated_at)
             VALUES ($1,$2,$2,'Refund','walk_in',
                     $3,$4,'refund_return','branch_portal',
                     $5,$6,$7,$8,
                     $9,'refunded','cash',true,
                     'returned','none','none',
                     'posted',$10,NOW(),NOW())`,
            [batId, branchId, today,
             now.toTimeString().slice(0, 8),
             refund.id,
             -dpTotal, -dpTotal, -qty,
             -dpTotal,
             approver]
          );

          // ── 3. branch_inventory_batches — restore stock to branch ────────────
          // Returned items go back into sellable branch inventory.
          // ON CONFLICT cannot reliably target NULL keys (btree treats each NULL as
          // distinct), so we use IS NOT DISTINCT FROM in an explicit UPDATE first,
          // then INSERT only if no existing row was found.
          const resolvedBatchNo = batchNo || null;
          const bibUpd = await client.query(
            `UPDATE branch_inventory_batches
             SET quantity   = quantity + $1,
                 status     = 'in_stock',
                 updated_at = NOW()
             WHERE branch_id = $2
               AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
               AND batch_no    IS NOT DISTINCT FROM $4
               AND expiry_date IS NULL`,
            [qty, branchId, product, resolvedBatchNo]
          );
          if (bibUpd.rowCount === 0) {
            const bibRestoreId = `BIB-RFND-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            await client.query(
              `INSERT INTO branch_inventory_batches
                 (id, branch_id, product_name, batch_no, expiry_date,
                  quantity, unit_price, source_warehouse, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,NULL,$5,$6,NULL,'in_stock',NOW(),NOW())`,
              [bibRestoreId, branchId, product, resolvedBatchNo, qty, unitDp]
            );
          }

          // ── 4. stock_movements — audit entry for stock engine ────────────────
          const canonicalBranch = normalizeBranchSlug(branchId) || branchId;
          await client.query(
            `INSERT INTO stock_movements
               (id, product_name, batch_no, expiry_date, quantity, movement_type,
                source_location, source_location_type,
                destination_location, destination_location_type,
                reference_id, notes, created_by, status,
                movement_date, created_at, updated_at)
             VALUES ($1,$2,$3,NULL,$4,'refund_return',
                     'customer','external',
                     $5,'branch',
                     $6,$7,$8,'posted',NOW(),NOW(),NOW())`,
            [smId, product, batchNo || null, qty,
             canonicalBranch,
             refund.id, `Refund approved — ${refund.reason}`, approver]
          );

          // ── 5. branch_refund_requests — mark approved ────────────────────────
          await client.query(
            `UPDATE branch_refund_requests
             SET status='approved', approved_by=$1, movement_id=$2, processed_at=NOW()
             WHERE id=$3`,
            [approver, movId, id]
          );
        });

        // ── 6. Recompute inventory_balances for the branch (best-effort) ─────
        const canonicalBranchForRecompute = normalizeBranchSlug(branchId) || branchId;
        recomputeLocationBalances(canonicalBranchForRecompute, 'branch').catch(e =>
          console.error('[refundApproval] recomputeLocationBalances error:', e.message)
        );

        // ── 7. Reverse distributor profit if any (best-effort) ───────────────
        if (refund.sale_reference) {
          query(
            `UPDATE branch_distributor_profit
             SET profit_amount = GREATEST(0, profit_amount - $1),
                 status = CASE WHEN profit_amount <= $1 THEN 'reversed' ELSE status END,
                 updated_at = NOW()
             WHERE (sale_id = $2 OR sale_receipt = $2)
               AND status != 'reversed'`,
            [dpTotal, refund.sale_reference]
          ).catch(e => console.error('[refundApproval] distributor profit reversal error:', e.message));
        }

        return res.json({
          success: true,
          movement_id: movId,
          message: `Refund approved — ${qty} × ${product}. Sales figures adjusted; returned items held separately (not restored to sellable stock).`,
        });
      }

      if (action === 'reject') {
        if (!rejection_reason?.trim())
          return res.status(400).json({ success: false, error: 'rejection_reason is required when rejecting' });
        await query(
          `UPDATE branch_refund_requests
           SET status='rejected', approved_by=$1, rejection_reason=$2, processed_at=NOW()
           WHERE id=$3`,
          [approved_by || 'Stock Manager', rejection_reason, id]
        );
        return res.json({ success: true, message: 'Refund request rejected' });
      }

      return res.status(400).json({ success: false, error: 'action must be approve or reject' });
    } catch (err) {
      console.error('[stock/refund-requests] PATCH error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
