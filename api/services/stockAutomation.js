/**
 * Stock Movement Automation Engine
 *
 * 4 automated jobs:
 *  1. runAutoWriteOff()           — nightly: submit expired batches for GM approval
 *  2. runAutoStockRequest()       — disabled without independent explicit reorder authority
 *  3. runAutoReceiveDispatched()  — every tick: auto-receive transfers idle >N hours
 *  4. checkAutoApproveTransfer() — retained compatibility hook; staff approval/dispatch required
 */

import { query, withTransaction, getMany, getOne } from '../db.js';
import { recomputeLocationBalances } from './stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';
import { getStockAlertPolicy } from './stockAlertPolicy.js';

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Config helpers ────────────────────────────────────────────────────────────

async function getConfig(key, defaultVal) {
  try {
    const row = await getOne(
      'SELECT value FROM stock_automation_config WHERE key = $1',
      [key]
    );
    return row?.value ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

// ── Logging helper ────────────────────────────────────────────────────────────

async function logAction(type, branchId, productName, qty, details, status = 'success', errorMsg = null) {
  const id = genId('AUTOLOG');
  await query(
    `INSERT INTO stock_automation_log
       (id, automation_type, branch_id, product_name, quantity, details, status, error_message, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [id, type, branchId || null, productName || null, qty || null,
     JSON.stringify(details || {}), status, errorMsg || null]
  ).catch(e => console.warn('[automation] log error:', e.message));
}

// ── Notification helper ───────────────────────────────────────────────────────

async function notify(recipientType, recipientId, title, message, type = 'info') {
  const id = genId('NOTIF');
  await query(
    `INSERT INTO notifications (id, recipient_type, recipient_id, title, message, type, is_read, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,false,NOW())`,
    [id, recipientType, recipientId, title, message, type]
  ).catch(e => console.warn('[automation] notify error:', e.message));
}

// ── Inline location type inference (avoids circular import) ──────────────────

function inferLocationTypeLocal(loc) {
  if (!loc) return null;
  const l = (loc || '').toLowerCase().trim();
  if (l === 'country_stock' || l === 'country') return 'country';
  if (l.includes('warehouse')) return 'warehouse';
  return 'branch';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTO WRITE-OFF: submit expired batches for GM approval
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoWriteOff() {
  const enabled = await getConfig('auto_writeoff_enabled', 'true');
  if (enabled !== 'true') {
    console.log('[automation] write-off: disabled');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Find all expired batches with quantity remaining that have no pending write-off already
  const expiredBatches = await getMany(
    `SELECT bib.id, bib.branch_id, bib.product_name, bib.batch_no, bib.expiry_date, bib.quantity
     FROM branch_inventory_batches bib
     WHERE bib.quantity > 0
       AND bib.expiry_date IS NOT NULL
       AND bib.expiry_date::date < $1::date
       AND NOT EXISTS (
         SELECT 1 FROM stock_movements sm
         WHERE sm.movement_type = 'write_off'
           AND sm.status = 'pending_approval'
           AND LOWER(REPLACE(sm.source_location, ' ', '_')) = LOWER(REPLACE(bib.branch_id, ' ', '_'))
           AND LOWER(TRIM(sm.product_name)) = LOWER(TRIM(bib.product_name))
           AND COALESCE(sm.batch_no, '') = COALESCE(bib.batch_no, '')
       )`,
    [today]
  );

  if (expiredBatches.length === 0) {
    console.log('[automation] write-off: no expired batches found');
    return;
  }

  let submitted = 0;
  for (const batch of expiredBatches) {
    try {
      const movId = genId('MOV');
      const refId  = genId('WO');
      const expiry = batch.expiry_date instanceof Date
        ? batch.expiry_date.toISOString().slice(0, 10)
        : String(batch.expiry_date || '').slice(0, 10);

      await query(
        `INSERT INTO stock_movements
           (id, product_name, batch_no, expiry_date, quantity, movement_type,
            source_location, source_location_type, destination_location,
            reference_id, notes, created_by, status, write_off_reason,
            movement_date, created_at, updated_at)
         VALUES
           ($1,$2,$3,$4,$5,'write_off',
            $6,'branch','written_off',
            $7,$8,'system','pending_approval','Expired (Auto)',
            NOW(),NOW(),NOW())`,
        [movId, batch.product_name, batch.batch_no || null, batch.expiry_date,
         batch.quantity, batch.branch_id, refId,
         `Auto write-off: ${batch.product_name} (batch ${batch.batch_no || 'N/A'}) expired ${expiry}. Qty: ${batch.quantity}`]
      );

      await logAction('auto_write_off', batch.branch_id, batch.product_name, batch.quantity, {
        batchNo: batch.batch_no, expiryDate: expiry, movementId: movId,
      });
      submitted++;
    } catch (err) {
      console.error('[automation] write-off error for batch', batch.id, ':', err.message);
      await logAction('auto_write_off', batch.branch_id, batch.product_name, batch.quantity,
        {}, 'error', err.message);
    }
  }

  if (submitted > 0) {
    await notify(
      'gm_alert', 'gm',
      `🗑️ ${submitted} expired batch${submitted !== 1 ? 'es' : ''} pending write-off approval`,
      `System automatically submitted ${submitted} expired stock batch${submitted !== 1 ? 'es' : ''} for your approval. Please review and approve in the GM Portal → Stock Alerts.`,
      'warning'
    );
    console.log(`[automation] write-off: submitted ${submitted} expired batch(es) for GM approval`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTO STOCK REQUEST: generate requests when stock hits min threshold
// ─────────────────────────────────────────────────────────────────────────────

// Depletion is a recommendation, not independent reorder authority. Legacy
// globally-enabled defaults and active threshold rules do not authorize orders.
export async function runAutoStockRequest() {
  return { requestsCreated:0, reason:'Staff must review low-stock alerts and submit an explicit stock request' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-RECEIVE DISPATCHED: receive transfers after N idle hours
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoReceiveDispatched() {
  const rawHours = Number(await getConfig('auto_receive_hours', '24'));
  const hours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 24;
  await withTransaction(async client => {
    // Serialize reminder selection across workers; never credit stock here.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('overdue-stock-receipt-reminders'))");
    const overdue = await client.query(
      `SELECT st.id, st.to_branch
       FROM stock_transfers st
       WHERE st.status IN ('dispatched', 'in_transit', 'partially_received')
         AND st.updated_at < NOW() - ($1::numeric * INTERVAL '1 hour')
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.title = 'Stock receipt overdue' AND n.message LIKE '%' || st.id || '%'
             AND n.created_at > NOW() - INTERVAL '24 hours'
         )`,
      [hours]
    );
    for (const transfer of overdue.rows) {
      await client.query(
        `INSERT INTO notifications (id, recipient_type, recipient_id, title, message, type, is_read, created_at)
         VALUES ($1,'branch',$2,'Stock receipt overdue',$3,'warning',false,NOW())`,
        [genId('NOTIF'), transfer.to_branch, `Transfer ${transfer.id} is awaiting staff receipt confirmation. Stock remains in transit; confirm actual quantities and discrepancies.`]
      );
    }
  });
}

// Retained only as historical implementation evidence; never called/exported.
async function legacyAutoReceiveDispatchedDisabled() {
  const enabled = await getConfig('auto_receive_enabled', 'true');
  if (enabled !== 'true') return;

  const hours = Number(await getConfig('auto_receive_hours', '24'));

  const staleTransfers = await getMany(
    `SELECT st.id, st.to_branch, st.from_warehouse
     FROM stock_transfers st
     WHERE st.status = 'dispatched'
       AND st.updated_at < NOW() - ($1 || ' hours')::INTERVAL`,
    [String(hours)]
  );

  if (staleTransfers.length === 0) return;

  let received = 0;

  for (const transfer of staleTransfers) {
    try {
      const items = await getMany(
        `SELECT product_name, quantity, batch_no, expiry_date
         FROM stock_transfer_items WHERE transfer_id = $1`,
        [transfer.id]
      );
      if (items.length === 0) continue;

      const branchId = normalizeBranchSlug(transfer.to_branch) || transfer.to_branch || null;
      if (!branchId) continue;

      await withTransaction(async (client) => {
        for (const item of items) {
          const qty       = Number(item.quantity || 0);
          if (qty <= 0) continue;
          const batchNo   = item.batch_no   || null;
          const expiryDate = item.expiry_date || null;
          const batchId   = genId('BIB');

          if (batchNo !== null && expiryDate !== null) {
            // Safe ON CONFLICT upsert when both columns are non-null
            await client.query(
              `INSERT INTO branch_inventory_batches
                 (id, branch_id, product_name, batch_no, expiry_date, quantity, source_warehouse, status, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5::date,$6,$7,'in_stock',NOW(),NOW())
               ON CONFLICT (branch_id, product_name, batch_no, expiry_date) DO UPDATE
                 SET quantity         = branch_inventory_batches.quantity + EXCLUDED.quantity,
                     source_warehouse = COALESCE(EXCLUDED.source_warehouse, branch_inventory_batches.source_warehouse),
                     updated_at       = NOW()`,
              [batchId, branchId, item.product_name, batchNo, expiryDate, qty, transfer.from_warehouse]
            );
          } else {
            // NULL-safe select-then-upsert for batches without full key
            const ex = await client.query(
              `SELECT id FROM branch_inventory_batches
               WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
                 AND batch_no IS NOT DISTINCT FROM $3
                 AND expiry_date IS NOT DISTINCT FROM $4
               FOR UPDATE`,
              [branchId, item.product_name, batchNo, expiryDate]
            );
            if (ex.rows.length > 0) {
              await client.query(
                'UPDATE branch_inventory_batches SET quantity=quantity+$1, updated_at=NOW() WHERE id=$2',
                [qty, ex.rows[0].id]
              );
            } else {
              await client.query(
                `INSERT INTO branch_inventory_batches
                   (id,branch_id,product_name,batch_no,expiry_date,quantity,source_warehouse,status,created_at,updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,'in_stock',NOW(),NOW())`,
                [batchId, branchId, item.product_name, batchNo, expiryDate, qty, transfer.from_warehouse || null]
              );
            }
          }

          // Branch inventory movement record
          const bimId = genId('BIM');
          await client.query(
            `INSERT INTO branch_inventory_movements
               (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
             VALUES ($1,$2,'receive',$3,$4,$5,$6,$7,'system',NOW())`,
            [bimId, branchId, item.product_name, batchNo, qty, transfer.id,
             `Auto-received from ${(transfer.from_warehouse || 'warehouse').replace(/_/g, ' ')} — transfer ${transfer.id} (${hours}h auto-receive timeout)`]
          );

          // Stock movement record
          const smId = genId('MOV');
          const srcLocType = inferLocationTypeLocal(transfer.from_warehouse);
          await client.query(
            `INSERT INTO stock_movements
               (id, product_name, batch_no, expiry_date, quantity, movement_type,
                source_location, source_location_type,
                destination_location, destination_location_type,
                reference_id, notes, created_by, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,'transfer_in',$6,$7,$8,'branch',$9,$10,'system','posted',NOW(),NOW())`,
            [smId, item.product_name, batchNo, expiryDate, qty,
             transfer.from_warehouse || 'warehouse', srcLocType, branchId,
             transfer.id, `Auto-received: transfer ${transfer.id} (${hours}h timeout)`]
          );
        }

        // Mark transfer received
        await client.query(
          `UPDATE stock_transfers SET status='received', updated_at=NOW() WHERE id=$1`,
          [transfer.id]
        );
      });

      // Recompute inventory_balances cache
      recomputeLocationBalances('branch', branchId).catch(() => {});
      if (transfer.from_warehouse) {
        recomputeLocationBalances(inferLocationTypeLocal(transfer.from_warehouse), transfer.from_warehouse).catch(() => {});
      }

      await notify('branch_alert', transfer.to_branch,
        `📬 Transfer Auto-Received`,
        `Transfer ${transfer.id} was automatically marked as received after ${hours} hours with no response. Stock has been added to your inventory. Please verify quantities.`,
        'info'
      );

      await logAction('auto_receive', transfer.to_branch, null, null, { transferId: transfer.id, hours });
      received++;
    } catch (err) {
      console.error('[automation] auto-receive error for transfer', transfer.id, ':', err.message);
      await logAction('auto_receive', transfer.to_branch, null, null,
        { transferId: transfer.id }, 'error', err.message);
    }
  }

  if (received > 0) {
    console.log(`[automation] auto-receive: processed ${received} stale dispatch(es)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHECK AUTO-APPROVE SMALL TRANSFER (called inline from transfers.js POST)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a new transfer is created.
 * If total qty ≤ threshold, immediately advances status to 'dispatched',
 * deducts from source, and posts stock_movements — skipping GM approval entirely.
 *
 * @returns {boolean} true if auto-approved, false otherwise
 */
export async function checkAutoApproveTransfer(transferId, totalQty, fromWarehouse, toBranch, actorName) {
  // Size does not establish approval or prove that goods were physically sent.
  return false;
}
async function legacyAutoApproveTransferDisabled(transferId, totalQty, fromWarehouse, toBranch, actorName) {
  try {
    const enabled = await getConfig('small_transfer_auto_approve', 'true');
    if (enabled !== 'true') return false;

    const threshold = Number(await getConfig('small_transfer_threshold', '5'));
    if (Number(totalQty) > threshold) return false;

    const srcLocType = inferLocationTypeLocal(fromWarehouse);

    await withTransaction(async (client) => {
      // 1. Get items
      const itemsRes = await client.query(
        'SELECT product_name, quantity, batch_no, expiry_date FROM stock_transfer_items WHERE transfer_id=$1',
        [transferId]
      );
      const items = itemsRes.rows;

      // 2. Deduct from source
      for (const item of items) {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;

        if (srcLocType === 'warehouse' || srcLocType === 'country') {
          // Deduct from stock_batches (FEFO)
          const batches = await client.query(
            `SELECT id, remaining_quantity FROM stock_batches
             WHERE (location = $1 OR warehouse_id = $1)
               AND LOWER(TRIM(description)) = LOWER(TRIM($2))
               AND remaining_quantity > 0
             ORDER BY expiry_date ASC NULLS LAST
             FOR UPDATE`,
            [fromWarehouse, item.product_name]
          );
          let rem = qty;
          for (const b of batches.rows) {
            if (rem <= 0) break;
            const take = Math.min(rem, Number(b.remaining_quantity));
            await client.query(
              `UPDATE stock_batches
               SET remaining_quantity   = remaining_quantity - $1,
                   dispatched_quantity  = dispatched_quantity + $1,
                   updated_at           = NOW()
               WHERE id = $2`,
              [take, b.id]
            );
            rem -= take;
          }
        } else {
          // Deduct from branch_inventory_batches (FEFO)
          const batches = await client.query(
            `SELECT id, quantity FROM branch_inventory_batches
             WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
             ORDER BY expiry_date ASC NULLS LAST
             FOR UPDATE`,
            [fromWarehouse, item.product_name]
          );
          let rem = qty;
          for (const b of batches.rows) {
            if (rem <= 0) break;
            const take = Math.min(rem, Number(b.quantity));
            await client.query(
              'UPDATE branch_inventory_batches SET quantity=quantity-$1, updated_at=NOW() WHERE id=$2',
              [take, b.id]
            );
            rem -= take;
          }
        }

        // 3. Stock movement: transfer_out
        const smId = genId('MOV');
        await client.query(
          `INSERT INTO stock_movements
             (id, product_name, batch_no, expiry_date, quantity, movement_type,
              source_location, source_location_type,
              destination_location, destination_location_type,
              reference_id, notes, created_by, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'transfer_out',$6,$7,$8,'branch',$9,$10,$11,'posted',NOW(),NOW())`,
          [smId, item.product_name, item.batch_no || null, item.expiry_date || null, qty,
           fromWarehouse || 'warehouse', srcLocType, toBranch || 'branch',
           transferId,
           `Auto-dispatched: small transfer ≤${threshold} units`,
           actorName || 'system']
        );
      }

      // 4. Advance transfer to dispatched
      await client.query(
        `UPDATE stock_transfers
         SET status='dispatched', updated_at=NOW(), gm_approved_by='system',
             gm_action='auto_approved'
         WHERE id=$1`,
        [transferId]
      );
    });

    // Recompute balances
    if (fromWarehouse) {
      recomputeLocationBalances(srcLocType, fromWarehouse).catch(() => {});
    }

    await notify('branch_alert', toBranch,
      `⚡ Transfer Auto-Dispatched`,
      `A small transfer (≤${threshold} units) to your branch was automatically approved and dispatched from ${(fromWarehouse || 'warehouse').replace(/_/g, ' ')}. Please confirm receipt when it arrives.`,
      'info'
    );

    await logAction('auto_approve_transfer', toBranch, null, totalQty, {
      transferId, threshold, fromWarehouse,
    });

    console.log(`[automation] auto-approved small transfer ${transferId} (qty=${totalQty} ≤ ${threshold})`);
    return true;
  } catch (err) {
    console.error('[automation] auto-approve transfer error:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PENDING-APPROVAL ESCALATION: alert GM when transfers wait too long
// ─────────────────────────────────────────────────────────────────────────────
export async function runPendingApprovalEscalation() {
  const enabled = await getConfig('pending_escalation_enabled', 'true');
  if (enabled !== 'true') return;

  const hours = Number(await getConfig('pending_escalation_hours', '4'));

  const pending = await getMany(
    `SELECT id, from_warehouse, to_branch, COALESCE(priority, 'normal') AS priority, created_at
     FROM stock_transfers
     WHERE status IN ('pending_approval','pending')
       AND updated_at < NOW() - ($1 || ' hours')::INTERVAL
       AND created_at > NOW() - INTERVAL '7 days'`,
    [String(hours)]
  );

  if (pending.length === 0) return;

  const highPriority = pending.filter(t => (t.priority || '').toLowerCase() === 'high');

  await notify(
    'gm_alert', 'gm',
    `⏰ ${pending.length} Transfer${pending.length !== 1 ? 's' : ''} Awaiting GM Approval`,
    `${pending.length} dispatch request${pending.length !== 1 ? 's have' : ' has'} been waiting for GM approval for over ${hours} hours` +
    `${highPriority.length > 0 ? ` — ${highPriority.length} are HIGH priority` : ''}. Please review in the GM Portal → Dispatches.`,
    highPriority.length > 0 ? 'warning' : 'info'
  );

  for (const t of pending) {
    await logAction('pending_escalation', t.to_branch, null, null,
      { transferId: t.id, hours, priority: t.priority });
  }

  console.log(`[automation] escalation: ${pending.length} pending-approval transfer(s) escalated to GM`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STUCK-APPROVAL CLEANUP: detect & optionally revert stale approved transfers
// ─────────────────────────────────────────────────────────────────────────────
export async function runStuckApprovalCleanup() {
  const enabled = await getConfig('stuck_approval_enabled', 'true');
  if (enabled !== 'true') return;

  const hours      = Number(await getConfig('stuck_approval_hours', '8'));
  const autoRevert = await getConfig('stuck_approval_auto_revert', 'false');

  const stuck = await getMany(
    `SELECT id, from_warehouse, to_branch, created_by
     FROM stock_transfers
     WHERE status = 'approved'
       AND updated_at < NOW() - ($1 || ' hours')::INTERVAL`,
    [String(hours)]
  );

  if (stuck.length === 0) return;

  for (const t of stuck) {
    try {
      await notify(
        'gm_alert', 'gm',
        `⚠️ Transfer Stuck in Approved State`,
        `Transfer ${t.id} (${(t.from_warehouse || '').replace(/_/g, ' ')} → ${(t.to_branch || '').replace(/_/g, ' ')}) has been approved but not dispatched for over ${hours} hours. Stock is still reserved. Please dispatch or cancel.`,
        'warning'
      );

      if (autoRevert === 'true') {
        await query(
          `UPDATE stock_transfers SET status='pending_approval', updated_at=NOW() WHERE id=$1 AND status='approved'`,
          [t.id]
        );

        // Restore dispatched_quantity back to remaining_quantity (FEFO reverse order)
        const items = await getMany(
          'SELECT product_name, quantity FROM stock_transfer_items WHERE transfer_id=$1',
          [t.id]
        );
        for (const item of items) {
          const qty = Number(item.quantity || 0);
          if (qty <= 0 || !t.from_warehouse) continue;
          const batches = await getMany(
            `SELECT id, dispatched_quantity FROM stock_batches
             WHERE (location=$1 OR warehouse_id=$1)
               AND LOWER(TRIM(description))=LOWER(TRIM($2))
               AND dispatched_quantity > 0
             ORDER BY expiry_date ASC NULLS LAST`,
            [t.from_warehouse, item.product_name]
          );
          let rem = qty;
          for (const b of batches) {
            if (rem <= 0) break;
            const restore = Math.min(rem, Number(b.dispatched_quantity));
            await query(
              `UPDATE stock_batches
               SET remaining_quantity = remaining_quantity + $1,
                   dispatched_quantity = GREATEST(dispatched_quantity - $1, 0),
                   updated_at = NOW()
               WHERE id=$2`,
              [restore, b.id]
            );
            rem -= restore;
          }
        }

        await query(
          `UPDATE stock_movements SET status='cancelled', updated_at=NOW()
           WHERE reference_id=$1 AND movement_type='reserved' AND status='posted'`,
          [t.id]
        );

        await logAction('stuck_approval_revert', t.to_branch, null, null, { transferId: t.id, hours });
        console.log(`[automation] stuck-approval: reverted transfer ${t.id} to pending_approval`);
      } else {
        await logAction('stuck_approval_alert', t.to_branch, null, null, { transferId: t.id, hours });
      }
    } catch (err) {
      console.error('[automation] stuck-approval error for transfer', t.id, ':', err.message);
    }
  }

  console.log(`[automation] stuck-approval: flagged ${stuck.length} stuck transfer(s)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INVENTORY BALANCE DRIFT REPAIR: nightly reconciliation of cache vs truth
// ─────────────────────────────────────────────────────────────────────────────
export async function runInventoryDriftRepair() {
  const enabled = await getConfig('drift_repair_enabled', 'true');
  if (enabled !== 'true') return;

  const tolerance = Number(await getConfig('drift_tolerance_units', '1'));

  const locations = await getMany(
    `SELECT DISTINCT location_type, location_id FROM inventory_balances WHERE closing_qty >= 0`
  );

  const INWARD  = ['supplier_import_receipt','warehouse_receipt','branch_receipt','transfer_in','received','return_in','positive_adjustment'];
  const OUTWARD = ['walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','sale','online_order_fulfilment','prescription_dispense','write_off','field_use','transfer_out','negative_adjustment'];

  let repaired = 0;

  for (const loc of locations) {
    try {
      const liveRows = await getMany(
        `SELECT product_name, COALESCE(batch_no,'') AS batch_no,
                SUM(CASE WHEN movement_type = ANY($2::text[]) THEN quantity ELSE 0 END) -
                SUM(CASE WHEN movement_type = ANY($3::text[]) THEN quantity ELSE 0 END) AS live_qty
         FROM stock_movements
         WHERE (source_location = $1 OR destination_location = $1)
           AND status IN ('posted','completed','approved')
         GROUP BY product_name, COALESCE(batch_no,'')`,
        [loc.location_id, INWARD, OUTWARD]
      );

      let needsRecompute = false;
      for (const row of liveRows) {
        const liveQty = Number(row.live_qty || 0);
        const cached  = await getOne(
          `SELECT closing_qty FROM inventory_balances
           WHERE location_type=$1
             AND LOWER(REPLACE(location_id,' ','_'))=LOWER(REPLACE($2,' ','_'))
             AND LOWER(TRIM(product_name))=LOWER(TRIM($3))
             AND COALESCE(batch_no,'')=$4`,
          [loc.location_type, loc.location_id, row.product_name, row.batch_no]
        );
        if (!cached) continue;
        const drift = Math.abs(liveQty - Number(cached.closing_qty || 0));
        if (drift > tolerance) {
          await logAction('drift_repair', loc.location_id, row.product_name, drift, {
            cached: Number(cached.closing_qty || 0), live: liveQty, locationType: loc.location_type,
          });
          needsRecompute = true;
          break;
        }
      }

      if (needsRecompute) {
        recomputeLocationBalances(loc.location_type, loc.location_id).catch(() => {});
        repaired++;
      }
    } catch (err) {
      console.warn('[automation] drift-repair error for', loc.location_id, ':', err.message);
    }
  }

  if (repaired > 0) {
    console.log(`[automation] drift-repair: triggered recompute for ${repaired} location(s)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WAREHOUSE REORDER FROM COUNTRY STOCK
// ─────────────────────────────────────────────────────────────────────────────
export async function runWarehouseReorderCheck() {
  const enabled = await getConfig('warehouse_reorder_enabled', 'true');
  if (enabled !== 'true') return;

  const minQty     = Number(await getConfig('warehouse_min_qty', '20'));
  const reorderQty = Number(await getConfig('warehouse_reorder_qty', '50'));

  const lowWarehouse = await getMany(
    `SELECT location_id, product_name, closing_qty
     FROM inventory_balances
     WHERE location_type='warehouse' AND closing_qty >= 0 AND closing_qty < $1
     ORDER BY closing_qty ASC`,
    [minQty]
  );

  if (lowWarehouse.length === 0) return;

  // Skip products that already have an open warehouse reorder request (last 3 days)
  const openReqs = await getMany(
    `SELECT requesting_branch, items FROM stock_requests
     WHERE status IN ('pending','approved')
       AND notes ILIKE '%warehouse reorder%'
       AND created_at > NOW() - INTERVAL '3 days'`
  );
  const openKeys = new Set();
  for (const req of openReqs) {
    let items = [];
    try { items = typeof req.items === 'string' ? JSON.parse(req.items || '[]') : (req.items || []); } catch {}
    const br = normalizeBranchSlug(req.requesting_branch) || req.requesting_branch;
    for (const item of items) openKeys.add(`${br}||${(item.product_name || '').toLowerCase().trim()}`);
  }

  const byWarehouse = new Map();
  for (const row of lowWarehouse) {
    const brNorm = normalizeBranchSlug(row.location_id) || row.location_id;
    const key = `${brNorm}||${row.product_name.toLowerCase().trim()}`;
    if (openKeys.has(key)) continue;
    if (!byWarehouse.has(row.location_id)) byWarehouse.set(row.location_id, []);
    byWarehouse.get(row.location_id).push(row);
  }

  let created = 0;
  for (const [warehouseId, rows] of byWarehouse.entries()) {
    try {
      const id = genId('ORD');
      await query(
        `INSERT INTO stock_requests (id, requesting_branch, created_by, priority, notes, items, status, created_at, updated_at)
         VALUES ($1,$2,'system','high',$3,$4,'pending',NOW(),NOW())`,
        [id, warehouseId,
         `Warehouse reorder: ${rows.length} product${rows.length !== 1 ? 's' : ''} below minimum (${minQty} units) — warehouse reorder from country stock`,
         JSON.stringify(rows.map(r => ({
           product_name: r.product_name, productName: r.product_name,
           quantity: reorderQty, unit: 'units', current_qty: Number(r.closing_qty || 0),
         })))]
      );

      const wLabel = warehouseId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      await notify('gm_alert', 'gm',
        `🏭 Warehouse Reorder Required — ${wLabel}`,
        `${rows.length} product${rows.length !== 1 ? 's' : ''} at ${wLabel} fell below minimum (${minQty} units). A reorder request from Country Stock has been raised. Request #${id}.`,
        'warning'
      );

      for (const row of rows) {
        await logAction('warehouse_reorder', warehouseId, row.product_name, Number(row.closing_qty || 0),
          { requestId: id, minQty, reorderQty });
      }
      created++;
    } catch (err) {
      console.error('[automation] warehouse-reorder error for', warehouseId, ':', err.message);
    }
  }

  if (created > 0) console.log(`[automation] warehouse-reorder: raised ${created} reorder request(s)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. INTER-BRANCH SURPLUS REDISTRIBUTION SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function runInterBranchRedistribution() {
  const enabled = await getConfig('inter_branch_redistrib_enabled', 'true');
  if (enabled !== 'true') return;

  const surplusRatio = Number(await getConfig('inter_branch_surplus_ratio', '2'));
  const minThreshold = Number(await getConfig('stock_request_min_qty', '5'));

  const branchStocks = await getMany(
    `SELECT location_id AS branch_id, product_name, closing_qty
     FROM inventory_balances
     WHERE location_type='branch' AND closing_qty >= 0`
  );

  const productMap = new Map();
  for (const row of branchStocks) {
    if (!productMap.has(row.product_name)) productMap.set(row.product_name, []);
    productMap.get(row.product_name).push({ branchId: row.branch_id, qty: Number(row.closing_qty || 0) });
  }

  const suggestions = [];

  for (const [product, branches] of productMap.entries()) {
    if (branches.length < 2) continue;
    const totalQty = branches.reduce((s, b) => s + b.qty, 0);
    const avgQty   = totalQty / branches.length;
    if (avgQty < 2) continue;

    const surplus  = branches.filter(b => b.qty > avgQty * surplusRatio && b.qty > minThreshold * 2);
    const deficits = branches.filter(b => b.qty < minThreshold && b.qty < avgQty * 0.5);

    for (const src of surplus) {
      for (const dst of deficits) {
        const suggestQty = Math.floor((src.qty - avgQty) / 2);
        if (suggestQty <= 0) continue;
        suggestions.push({
          product, avgQty: Math.round(avgQty),
          from: src.branchId, fromQty: src.qty,
          to:   dst.branchId, toQty:   dst.qty,
          suggestQty,
        });
      }
    }
  }

  if (suggestions.length === 0) return;

  const topN  = suggestions.slice(0, 10);
  const lines = topN.map(s =>
    `• ${s.product}: transfer ~${s.suggestQty} units from ${s.from.replace(/_/g, ' ')} (${s.fromQty}) → ${s.to.replace(/_/g, ' ')} (${s.toQty})`
  ).join('\n');

  await notify('gm_alert', 'gm',
    `🔄 ${suggestions.length} Inter-Branch Redistribution Suggestion${suggestions.length !== 1 ? 's' : ''}`,
    `Stock imbalances detected across branches. Suggested moves:\n${lines}${suggestions.length > 10 ? `\n…and ${suggestions.length - 10} more.` : '\nReview branch inventory and create transfers as needed.'}`,
    'info'
  );

  await logAction('inter_branch_redistrib', null, null, null,
    { suggestionCount: suggestions.length, topSuggestions: topN });

  console.log(`[automation] inter-branch: ${suggestions.length} redistribution suggestion(s) sent to GM`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. NIGHTLY STOCK HEALTH DIGEST
// ─────────────────────────────────────────────────────────────────────────────
export async function runNightlyStockHealthDigest() {
  const enabled = await getConfig('health_digest_enabled', 'true');
  if (enabled !== 'true') return;

  const today = new Date().toISOString().slice(0, 10);
  const alertPolicy = await getStockAlertPolicy();

  const [expiredRows, lowStockRows, stuckRows, pendingRows, inTransitRows, writeOffRows] = await Promise.all([
    getMany(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(quantity),0) AS qty FROM branch_inventory_batches
       WHERE quantity > 0 AND expiry_date IS NOT NULL AND expiry_date::date < $1::date`, [today]
    ),
    getMany(
      `SELECT COUNT(DISTINCT location_id) AS cnt FROM inventory_balances
       WHERE location_type='branch' AND closing_qty > 0 AND closing_qty < $1`,
      [alertPolicy.lowStockThreshold]
    ),
    getMany(
      `SELECT COUNT(*) AS cnt FROM stock_transfers
       WHERE status='approved' AND updated_at < NOW() - INTERVAL '8 hours'`
    ),
    getMany(
      `SELECT COUNT(*) AS cnt FROM stock_transfers
       WHERE status IN ('pending_approval','pending') AND created_at > NOW() - INTERVAL '7 days'`
    ),
    getMany(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(sti.quantity),0) AS total_qty
       FROM stock_transfers st
       JOIN stock_transfer_items sti ON sti.transfer_id = st.id
       WHERE st.status = 'dispatched'`
    ),
    getMany(
      `SELECT COALESCE(SUM(sm.quantity * COALESCE(pp.distributor_price,0)),0) AS value
       FROM stock_movements sm
       LEFT JOIN live_product_prices pp ON LOWER(TRIM(pp.description))=LOWER(TRIM(sm.product_name))
       WHERE sm.movement_type='write_off' AND sm.status='pending_approval'`
    ),
  ]);

  const expiredBatches = Number(expiredRows[0]?.cnt || 0);
  const expiredQty     = Number(expiredRows[0]?.qty || 0);
  const lowStockCount  = Number(lowStockRows[0]?.cnt || 0);
  const stuckCount     = Number(stuckRows[0]?.cnt || 0);
  const pendingCount   = Number(pendingRows[0]?.cnt || 0);
  const inTransitCount = Number(inTransitRows[0]?.cnt || 0);
  const inTransitQty   = Number(inTransitRows[0]?.total_qty || 0);
  const writeOffValue  = parseFloat(Number(writeOffRows[0]?.value || 0).toFixed(2));

  const digest = [
    `📅 Stock Health Digest — ${today}`,
    ``,
    expiredBatches > 0
      ? `🔴 ${expiredBatches} expired batch(es) | ${expiredQty} units | pending GM write-off approval`
      : `✅ No expired batches awaiting write-off`,
    lowStockCount > 0
      ? `🟡 ${lowStockCount} branch(es) with low stock (< ${alertPolicy.lowStockThreshold} units per product)`
      : `✅ All branches above critical stock threshold`,
    stuckCount > 0
      ? `⚠️  ${stuckCount} transfer(s) approved but not dispatched for > 8 hours — stock is reserved`
      : `✅ No stuck approved transfers`,
    pendingCount > 0
      ? `⏳ ${pendingCount} transfer(s) awaiting GM approval`
      : `✅ No transfers pending approval`,
    `📦 ${inTransitCount} transfer(s) in transit (${inTransitQty} units on the road)`,
    writeOffValue > 0
      ? `💰 Write-off exposure: N$${writeOffValue.toLocaleString()} DP value pending approval`
      : null,
  ].filter(Boolean).join('\n');

  await notify('gm_alert',    'gm',    '📊 Morning Stock Health Digest', digest, 'info');
  await notify('stock_alert', 'stock', '📊 Morning Stock Health Digest', digest, 'info');

  await logAction('health_digest', null, null, null, {
    expiredBatches, expiredQty, lowStockCount, stuckCount, pendingCount, inTransitCount, inTransitQty, writeOffValue,
  });

  console.log(`[automation] health-digest: sent (expired=${expiredBatches}, lowStock=${lowStockCount}, stuck=${stuckCount}, inTransit=${inTransitCount})`);
}
