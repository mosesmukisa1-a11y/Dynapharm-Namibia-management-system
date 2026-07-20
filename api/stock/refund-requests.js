import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query, withTransaction } from '../db.js';
import { generateBatId } from '../_lib/activityCapture.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';

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
          // Records the refund for audit and daily-report deduction (refundMovements
          // query in daily.js sums all refund_return movements by date).
          // NOTE: returned items are NOT restored to branch sellable stock —
          // they are held separately (damaged / returned to supplier).
          await client.query(
            `INSERT INTO branch_inventory_movements
               (id, branch_id, type, product_name, batch_no, quantity, unit_price,
                reference, notes, created_by, created_at)
             VALUES ($1,$2,'refund_return',$3,$4,$5,$6,$7,$8,$9,NOW())`,
            [movId, branchId, product, batchNo || null, qty, unitDp,
             refund.id, `Refund approved — ${refund.reason}`, approver]
          );

          // ── 2. branch_activity_transactions — reversal record ────────────────
          // Posts a negative-value row so daily.js and summary.js totals reflect
          // the deduction automatically when they sum grand_total / product_total_dp.
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

          // ── 5. branch_refund_requests — mark approved ────────────────────────
          await client.query(
            `UPDATE branch_refund_requests
             SET status='approved', approved_by=$1, movement_id=$2, processed_at=NOW()
             WHERE id=$3`,
            [approver, movId, id]
          );
        });

        // ── 6. Reverse distributor profit if any (best-effort) ───────────────
        // (Stock is NOT restored to branch inventory — returned items are held
        //  separately or returned to supplier, so no inventory recompute needed.)
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
