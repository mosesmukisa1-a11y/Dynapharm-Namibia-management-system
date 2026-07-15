/**
 * Stock Movement Automation Engine
 *
 * 4 automated jobs:
 *  1. runAutoWriteOff()           — nightly: submit expired batches for GM approval
 *  2. runAutoStockRequest()       — nightly: create stock requests when stock < min threshold
 *  3. runAutoReceiveDispatched()  — every tick: auto-receive transfers idle >N hours
 *  4. checkAutoApproveTransfer()  — inline at transfer creation: small qty → skip to dispatched
 */

import { query, withTransaction, getMany, getOne } from '../db.js';
import { recomputeLocationBalances } from './stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

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

export async function runAutoStockRequest() {
  const enabled = await getConfig('auto_stock_request_enabled', 'true');
  if (enabled !== 'true') {
    console.log('[automation] stock-request: disabled');
    return;
  }

  const globalMinQty      = Number(await getConfig('stock_request_min_qty', '5'));
  const globalReorderQty  = Number(await getConfig('stock_request_reorder_qty', '20'));
  const preferredWarehouse = await getConfig('preferred_warehouse', 'windhoek_warehouse');

  // Per-product-branch reorder rules
  const rules = await getMany(
    'SELECT branch_id, product_name, min_qty, reorder_qty, preferred_warehouse FROM stock_reorder_rules WHERE active = true'
  ).catch(() => []);

  const ruleMap = new Map();
  for (const r of rules) {
    const canonBranch = normalizeBranchSlug(r.branch_id) || r.branch_id;
    const key = `${canonBranch}||${(r.product_name || '').toLowerCase().trim()}`;
    ruleMap.set(key, r);
  }

  // Current branch totals
  const branchTotals = await getMany(
    `SELECT branch_id, product_name, SUM(quantity) AS total_qty
     FROM branch_inventory_batches
     WHERE quantity >= 0
     GROUP BY branch_id, product_name`
  );

  // Open stock requests in last 7 days (to avoid duplicates)
  const openRequests = await getMany(
    `SELECT requesting_branch, items FROM stock_requests
     WHERE status IN ('pending','approved')
       AND created_at > NOW() - INTERVAL '7 days'`
  );
  const openRequestKeys = new Set();
  for (const req of openRequests) {
    let items = [];
    try { items = typeof req.items === 'string' ? JSON.parse(req.items || '[]') : (req.items || []); } catch {}
    const branchNorm = normalizeBranchSlug(req.requesting_branch) || req.requesting_branch || '';
    for (const item of items) {
      openRequestKeys.add(`${branchNorm}||${(item.product_name || item.productName || '').toLowerCase().trim()}`);
    }
  }

  // Group products to request per branch
  const toRequest = new Map();

  for (const row of branchTotals) {
    const canonBranch  = normalizeBranchSlug(row.branch_id) || row.branch_id;
    const productLower = (row.product_name || '').toLowerCase().trim();
    const ruleKey = `${canonBranch}||${productLower}`;
    const rule = ruleMap.get(ruleKey);

    const minQty     = rule ? Number(rule.min_qty)     : globalMinQty;
    const reorderQty = rule ? Number(rule.reorder_qty) : globalReorderQty;
    const warehouse  = rule?.preferred_warehouse || preferredWarehouse;
    const totalQty   = Number(row.total_qty || 0);

    // Skip: no explicit rule and not below global threshold, OR not below rule threshold
    if (!rule && totalQty > globalMinQty) continue;
    if (totalQty > minQty) continue;

    // Skip if already have an open request for this branch+product
    if (openRequestKeys.has(ruleKey)) continue;

    if (!toRequest.has(canonBranch)) toRequest.set(canonBranch, []);
    toRequest.get(canonBranch).push({
      product_name: row.product_name,
      productName:  row.product_name,
      quantity:     reorderQty,
      unit:         'units',
      current_qty:  totalQty,
      preferred_warehouse: warehouse,
    });
  }

  let requestsCreated = 0;

  for (const [branchId, items] of toRequest.entries()) {
    try {
      const id        = genId('ORD');
      const warehouse = items[0].preferred_warehouse || preferredWarehouse;

      await query(
        `INSERT INTO stock_requests (id, requesting_branch, requested_by, priority, notes, items, status, created_at, updated_at)
         VALUES ($1,$2,'system','high',$3,$4,'pending',NOW(),NOW())`,
        [id, branchId,
         `Auto-generated reorder: ${items.length} product${items.length !== 1 ? 's' : ''} below minimum stock threshold`,
         JSON.stringify(items.map(i => ({
           product_name: i.product_name, productName: i.product_name,
           quantity: i.quantity, unit: i.unit,
         })))]
      );

      for (const item of items) {
        await logAction('auto_stock_request', branchId, item.product_name, item.quantity, {
          orderId: id, currentQty: item.current_qty, warehouse,
        });
      }

      const branchLabel = branchId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      await notify('branch_alert', branchId,
        `📦 Auto Stock Request Created`,
        `System created stock request #${id} for ${items.length} product${items.length !== 1 ? 's' : ''} that fell below minimum stock levels. Awaiting warehouse fulfilment.`,
        'info'
      );
      await notify('gm_alert', 'gm',
        `📦 Auto Stock Request — ${branchLabel}`,
        `Auto-generated stock request for ${branchLabel}: ${items.map(i => i.product_name).join(', ')}. Please review and approve in the GM Portal.`,
        'info'
      );

      requestsCreated++;
    } catch (err) {
      console.error('[automation] stock-request error for branch', branchId, ':', err.message);
    }
  }

  if (requestsCreated > 0) {
    console.log(`[automation] stock-request: created ${requestsCreated} auto-request(s)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-RECEIVE DISPATCHED: receive transfers after N idle hours
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoReceiveDispatched() {
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
