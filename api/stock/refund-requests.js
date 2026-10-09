import { applyAuthCors } from '../_lib/auth.js';
import { getMany, getOne, query, withTransaction } from '../db.js';
import { generateBatId } from '../_lib/activityCapture.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { lockStockBatchTx } from '../services/stockLocks.js';

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (!['stock', 'stock_manager', 'admin', 'superadmin', 'super_admin', 'gm'].includes(String(req.user.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Stock Manager or administrator access required' });
  }

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
      const { id, action, approved_by, rejection_reason, return_condition } = req.body || {};
      if (!id || !action)
        return res.status(400).json({ success: false, error: 'id and action are required' });

      const refund = await getOne('SELECT * FROM branch_refund_requests WHERE id = $1 FOR UPDATE', [id]);
      if (!refund) return res.status(404).json({ success: false, error: 'Refund request not found' });
      if (refund.status !== 'pending')
        return res.status(400).json({ success: false, error: 'Request has already been processed' });

      if (action === 'approve') {
        if (!['saleable', 'damaged', 'expired', 'quarantine'].includes(return_condition)) {
          return res.status(400).json({ success: false, error: 'Inspect the returned goods and select their condition before approving.' });
        }
        const now      = new Date();
        const movId    = `RFND-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
        const smId     = `SM-RFND-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        const batId    = generateBatId();
        const qty      = parseFloat(refund.quantity);
        if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ success: false, error: 'Refund quantity must be finite and positive' });
        const unitDp   = parseFloat(refund.unit_price);
        const dpTotal  = parseFloat(refund.refund_amount);
        const branchId = refund.branch_id;
        const product  = refund.product_name;
        const batchNo  = refund.batch_no || '';
        const approver = req.user.fullName || req.user.username || req.user.id || 'Stock Manager';
        const today    = now.toISOString().slice(0, 10);

        // ── Look up the live DP (cost basis) for the product so BAT product_total_dp
        // correctly reflects the inventory cost, not the campaign selling price. ──
        const originalCost = await getOne(
          `SELECT unit_dp FROM stock_movements WHERE reference_id=$1
           AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
           AND movement_type IN ('walkin_sale','walk_in_member_sale','walk_in_non_member_sale','campaign_sale','prescription_dispense','sale')
           AND status IN ('posted','approved') ORDER BY created_at LIMIT 1`,
          [refund.sale_reference, product]
        );
        // costDp: use live DP for the cost-basis column; fall back to refund.unit_price
        // only when the product has no price list entry (e.g. checkup fees).
        const costDp      = originalCost?.unit_dp != null ? Number(originalCost.unit_dp) : unitDp;
        const dpCostTotal = Math.round(costDp * qty * 100) / 100;

        await withTransaction(async (client) => {
          if (refund.sale_reference) {
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`refund-sale:${branchId}:${refund.sale_reference}`]);
            const sold = (await client.query(
              `SELECT SUM(quantity) AS quantity FROM stock_movements
               WHERE reference_id=$1 AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
                 AND COALESCE(batch_no,'')=COALESCE($3,'') AND status IN ('posted','approved')
                 AND movement_type IN ('walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','campaign_sale','prescription_dispense','sale')`,
              [refund.sale_reference, product, batchNo]
            )).rows[0];
            if (sold.quantity != null) {
              const returned = (await client.query(
                `SELECT COALESCE(SUM(quantity),0) AS quantity FROM branch_refund_requests
                 WHERE sale_reference=$1 AND branch_id=$2 AND LOWER(TRIM(product_name))=LOWER(TRIM($3))
                   AND COALESCE(batch_no,'')=COALESCE($4,'') AND status='approved' AND id != $5`,
                [refund.sale_reference, branchId, product, batchNo, refund.id]
              )).rows[0];
              if (Number(returned.quantity) + qty > Number(sold.quantity)) throw Object.assign(new Error('Cumulative returned quantity exceeds the original sale allocation.'), { statusCode: 400 });
            }
          }
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`refund-batch:${branchId}:${product.toLowerCase().trim()}:${batchNo || ''}`]);
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
          // product_total_dp → DP cost basis (what it cost the branch, mirrors original sale)
          // product_total_cp / grand_total → actual refunded amount (campaign price paid)
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
             -dpCostTotal, -dpTotal, -qty,
             -dpTotal,
             approver]
          );

          // ── 3. branch_inventory_batches — restore stock to branch ────────────
          // Returned items go back into sellable branch inventory.
          // We must restore into the SAME expiry-dated batch that was deducted at
          // sale time — not into a NULL-expiry row — otherwise the stock appears to
          // be a different batch and FEFO ordering is broken.
          //
          // expiry_date is not stored on the refund request itself, so we resolve it:
          //   a) from any live branch_inventory_batches row with matching batch_no
          //      (the batch still exists with remaining qty from other units)
          //   b) from stock_movements for the original sale reference
          //      (the batch was fully sold and the BIB row was deleted)
          //   c) NULL as a last resort (product genuinely has no expiry)
          const resolvedBatchNo = batchNo || null;

          let resolvedExpiry = null;
          // (a) existing batch row
          const expiryFromBib = await client.query(
            `SELECT expiry_date FROM branch_inventory_batches
             WHERE LOWER(TRIM(branch_id))    = LOWER(TRIM($1))
               AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
               AND batch_no IS NOT DISTINCT FROM $3
             ORDER BY expiry_date ASC NULLS LAST LIMIT 1`,
            [branchId, product, resolvedBatchNo]
          );
          if (expiryFromBib.rows.length > 0) {
            resolvedExpiry = expiryFromBib.rows[0].expiry_date || null;
          }
          // (b) stock_movements for the original sale
          if (!resolvedExpiry && refund.sale_reference) {
            const expiryFromSm = await client.query(
              `SELECT expiry_date FROM stock_movements
               WHERE LOWER(TRIM(product_name)) = LOWER(TRIM($1))
                 AND batch_no IS NOT DISTINCT FROM $2
                 AND reference_id = $3
               ORDER BY created_at DESC LIMIT 1`,
              [product, resolvedBatchNo, refund.sale_reference]
            );
            if (expiryFromSm.rows.length > 0) {
              resolvedExpiry = expiryFromSm.rows[0].expiry_date || null;
            }
          }

          // The refund row guards the operation; the logical batch lock protects
          // creation even when no row exists. FOR UPDATE protects existing stock.
          if (return_condition === 'saleable') {
          await lockStockBatchTx(client, branchId, product, resolvedBatchNo, resolvedExpiry);
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          const expiryDay = resolvedExpiry instanceof Date ? resolvedExpiry.toISOString().slice(0, 10) : String(resolvedExpiry || '').slice(0, 10);
          if (expiryDay && expiryDay < today) throw Object.assign(new Error('Expired returns cannot be restored to saleable stock.'), { statusCode: 400 });
          const lockedBib = await client.query(
            `SELECT id FROM branch_inventory_batches
             WHERE branch_id = $1
               AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
               AND batch_no    IS NOT DISTINCT FROM $3
               AND expiry_date IS NOT DISTINCT FROM $4
             FOR UPDATE`,
            [branchId, product, resolvedBatchNo, resolvedExpiry]
          );
          if (lockedBib.rows.length > 0) {
            await client.query(
              `UPDATE branch_inventory_batches
               SET quantity   = quantity + $1,
                   status     = 'in_stock',
                   updated_at = NOW()
               WHERE id = $2`,
              [qty, lockedBib.rows[0].id]
            );
          } else {
            const bibRestoreId = `BIB-RFND-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
            await client.query(
              `INSERT INTO branch_inventory_batches
                 (id, branch_id, product_name, batch_no, expiry_date,
                  quantity, unit_price, source_warehouse, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,'in_stock',NOW(),NOW())`,
              [bibRestoreId, branchId, product, resolvedBatchNo, resolvedExpiry, qty, unitDp]
            );
          }

          }
          // ── 4. stock_movements — audit entry for stock engine ────────────────
          // expiry_date must match what was written to branch_inventory_batches
          // (resolvedExpiry, not NULL).  If the movement uses NULL here while BIB
          // uses the real expiry, recomputeLocationBalances tracks them under
          // different keys and the branch inventory_balance diverges.
          const canonicalBranch = normalizeBranchSlug(branchId) || branchId;
          await client.query(
            `INSERT INTO stock_movements
               (id, product_name, batch_no, expiry_date, quantity, movement_type,
                source_location, source_location_type,
                destination_location, destination_location_type,
                reference_id, notes, created_by, status,
                movement_date, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,'refund_return',
                     'customer','external',
                     $6,$10,
                     $7,$8,$9,'posted',NOW(),NOW(),NOW())`,
            [smId, product, batchNo || null, resolvedExpiry || null, qty,
             return_condition === 'saleable' ? canonicalBranch : `quarantine:${canonicalBranch}`,
             refund.id, `Refund approved — ${refund.reason}`, approver, return_condition === 'saleable' ? 'branch' : 'quarantine']
          );

          // ── 5. branch_refund_requests — mark approved ────────────────────────
          await client.query(
            `UPDATE branch_refund_requests
             SET status='approved', approved_by=$1, movement_id=$2, processed_at=NOW(),
                 return_condition=$4, stock_disposition=$5
             WHERE id=$3`,
            [approver, movId, id, return_condition, return_condition === 'saleable' ? 'available' : 'segregated']
          );
          if (refund.sale_reference) await client.query(
            `UPDATE branch_distributor_profit
             SET profit_amount=GREATEST(0,profit_amount-$1),
                 status=CASE WHEN profit_amount <= $1 THEN 'reversed' ELSE status END,updated_at=NOW()
             WHERE (sale_id=$2 OR sale_receipt=$2) AND status != 'reversed'`,
            [dpTotal, refund.sale_reference]
          );
        });

        // ── 6. Recompute inventory_balances for the branch (best-effort) ─────
        // Signature: recomputeLocationBalances(locationType, locationId)
        const canonicalBranchForRecompute = normalizeBranchSlug(branchId) || branchId;
        recomputeLocationBalances('branch', canonicalBranchForRecompute).catch(e =>
          console.error('[refundApproval] recomputeLocationBalances error:', e.message)
        );
        if (return_condition !== 'saleable') recomputeLocationBalances('quarantine', `quarantine:${canonicalBranchForRecompute}`).catch(e => console.error('[refund-quarantine]', e.message));

        return res.json({
          success: true,
          movement_id: movId,
          return_condition,
          stock_disposition: return_condition === 'saleable' ? 'available' : 'segregated',
          message: `Refund approved — ${qty} × ${product}. ${return_condition === 'saleable' ? 'Accepted saleable goods restored to available stock.' : 'Goods recorded separately; available stock was not increased.'}`,
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
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
export default atomicStockRequest(handler, ['PATCH']);
