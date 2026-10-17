import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js"; /**
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
import { healthDigestEnabled } from './startupPolicy.js';

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Config helpers ────────────────────────────────────────────────────────────

async function getConfig(key, defaultVal) {
  try {
    const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/stockAutomation.js:26:0"),

    [key]);

    return row?.value ?? defaultVal;
  } catch {
    return defaultVal;
  }
}

// ── Logging helper ────────────────────────────────────────────────────────────

async function logAction(type, branchId, productName, qty, details, status = 'success', errorMsg = null) {
  const id = genId('AUTOLOG');
  await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:40:1"),



  [id, type, branchId || null, productName || null, qty || null,
  JSON.stringify(details || {}), status, errorMsg || null]).
  catch((e) => console.warn('[automation] log error:', e.message));
}

// ── Notification helper ───────────────────────────────────────────────────────

async function notify(recipientType, recipientId, title, message, type = 'info') {
  const id = genId('NOTIF');
  await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:53:2"),


  [id, recipientType, recipientId, title, message, type]).
  catch((e) => console.warn('[automation] notify error:', e.message));
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
  const expiredBatches = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:84:3"),













  [today]);


  if (expiredBatches.length === 0) {
    console.log('[automation] write-off: no expired batches found');
    return;
  }

  let submitted = 0;
  for (const batch of expiredBatches) {
    try {
      const movId = genId('MOV');
      const refId = genId('WO');
      const expiry = batch.expiry_date instanceof Date ?
      batch.expiry_date.toISOString().slice(0, 10) :
      String(batch.expiry_date || '').slice(0, 10);

      await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:115:4"),










      [movId, batch.product_name, batch.batch_no || null, batch.expiry_date,
      batch.quantity, batch.branch_id, refId,
      `Auto write-off: ${batch.product_name} (batch ${batch.batch_no || 'N/A'}) expired ${expiry}. Qty: ${batch.quantity}`]);


      await logAction('auto_write_off', batch.branch_id, batch.product_name, batch.quantity, {
        batchNo: batch.batch_no, expiryDate: expiry, movementId: movId
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
  return { requestsCreated: 0, reason: 'Staff must review low-stock alerts and submit an explicit stock request' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-RECEIVE DISPATCHED: receive transfers after N idle hours
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoReceiveDispatched() {
  const rawHours = Number(await getConfig('auto_receive_hours', '24'));
  const hours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 24;
  await withTransaction(async (client) => {
    // Serialize reminder selection across workers; never credit stock here.
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:171:5"), []);
    const overdue = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:173:6"),









    [hours]);

    for (const transfer of overdue.rows) {
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:186:7"),


      [genId('NOTIF'), transfer.to_branch, `Transfer ${transfer.id} is awaiting staff receipt confirmation. Stock remains in transit; confirm actual quantities and discrepancies.`]);

    }
  });
}

// Retained only as historical implementation evidence; never called/exported.
async function legacyAutoReceiveDispatchedDisabled() {
  const enabled = await getConfig('auto_receive_enabled', 'true');
  if (enabled !== 'true') return;

  const hours = Number(await getConfig('auto_receive_hours', '24'));

  const staleTransfers = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:202:8"),




  [String(hours)]);


  if (staleTransfers.length === 0) return;

  let received = 0;

  for (const transfer of staleTransfers) {
    try {
      const items = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:216:9"),


      [transfer.id]);

      if (items.length === 0) continue;

      const branchId = normalizeBranchSlug(transfer.to_branch) || transfer.to_branch || null;
      if (!branchId) continue;

      await withTransaction(async (client) => {
        for (const item of items) {
          const qty = Number(item.quantity || 0);
          if (qty <= 0) continue;
          const batchNo = item.batch_no || null;
          const expiryDate = item.expiry_date || null;
          const batchId = genId('BIB');

          if (batchNo !== null && expiryDate !== null) {
            // Safe ON CONFLICT upsert when both columns are non-null
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:236:10"),







            [batchId, branchId, item.product_name, batchNo, expiryDate, qty, transfer.from_warehouse]);

          } else {
            // NULL-safe select-then-upsert for batches without full key
            const ex = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:248:11"),





            [branchId, item.product_name, batchNo, expiryDate]);

            if (ex.rows.length > 0) {
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:257:12"),

              [qty, ex.rows[0].id]);

            } else {
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:262:13"),



              [batchId, branchId, item.product_name, batchNo, expiryDate, qty, transfer.from_warehouse || null]);

            }
          }

          // Branch inventory movement record
          const bimId = genId('BIM');
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:273:14"),



          [bimId, branchId, item.product_name, batchNo, qty, transfer.id,
          `Auto-received from ${(transfer.from_warehouse || 'warehouse').replace(/_/g, ' ')} — transfer ${transfer.id} (${hours}h auto-receive timeout)`]);


          // Stock movement record
          const smId = genId('MOV');
          const srcLocType = inferLocationTypeLocal(transfer.from_warehouse);
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:284:15"),






          [smId, item.product_name, batchNo, expiryDate, qty,
          transfer.from_warehouse || 'warehouse', srcLocType, branchId,
          transfer.id, `Auto-received: transfer ${transfer.id} (${hours}h timeout)`]);

        }

        // Mark transfer received
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:298:16"),

        [transfer.id]);

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
      const itemsRes = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:357:17"),

      [transferId]);

      const items = itemsRes.rows;

      // 2. Deduct from source
      for (const item of items) {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;

        if (srcLocType === 'warehouse' || srcLocType === 'country') {
          // Deduct from stock_batches (FEFO)
          const batches = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:370:18"),






          [fromWarehouse, item.product_name]);

          let rem = qty;
          for (const b of batches.rows) {
            if (rem <= 0) break;
            const take = Math.min(rem, Number(b.remaining_quantity));
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:383:19"),





            [take, b.id]);

            rem -= take;
          }
        } else {
          // Deduct from branch_inventory_batches (FEFO)
          const batches = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:395:20"),




          [fromWarehouse, item.product_name]);

          let rem = qty;
          for (const b of batches.rows) {
            if (rem <= 0) break;
            const take = Math.min(rem, Number(b.quantity));
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:406:21"),

            [take, b.id]);

            rem -= take;
          }
        }

        // 3. Stock movement: transfer_out
        const smId = genId('MOV');
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:416:22"),






        [smId, item.product_name, item.batch_no || null, item.expiry_date || null, qty,
        fromWarehouse || 'warehouse', srcLocType, toBranch || 'branch',
        transferId,
        `Auto-dispatched: small transfer ≤${threshold} units`,
        actorName || 'system']);

      }

      // 4. Advance transfer to dispatched
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/services/stockAutomation.js:432:23"),




      [transferId]);

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
      transferId, threshold, fromWarehouse
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

  const pending = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:473:24"),





  [String(hours)]);


  if (pending.length === 0) return;

  const highPriority = pending.filter((t) => (t.priority || '').toLowerCase() === 'high');

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

  const hours = Number(await getConfig('stuck_approval_hours', '8'));
  const autoRevert = await getConfig('stuck_approval_auto_revert', 'false');

  const stuck = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:512:25"),




  [String(hours)]);


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
        await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:532:26"),

        [t.id]);


        // Restore dispatched_quantity back to remaining_quantity (FEFO reverse order)
        const items = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:538:27"),

        [t.id]);

        for (const item of items) {
          const qty = Number(item.quantity || 0);
          if (qty <= 0 || !t.from_warehouse) continue;
          const batches = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:545:28"),





          [t.from_warehouse, item.product_name]);

          let rem = qty;
          for (const b of batches) {
            if (rem <= 0) break;
            const restore = Math.min(rem, Number(b.dispatched_quantity));
            await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:557:29"),





            [restore, b.id]);

            rem -= restore;
          }
        }

        await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:569:30"),


        [t.id]);


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

  const locations = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:597:31"), []);



  const INWARD = ['supplier_import_receipt', 'warehouse_receipt', 'branch_receipt', 'transfer_in', 'received', 'return_in', 'positive_adjustment'];
  const OUTWARD = ['walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'sale', 'online_order_fulfilment', 'prescription_dispense', 'write_off', 'field_use', 'transfer_out', 'negative_adjustment'];

  let repaired = 0;

  for (const loc of locations) {
    try {
      const liveRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:608:32"),







      [loc.location_id, INWARD, OUTWARD]);


      let needsRecompute = false;
      for (const row of liveRows) {
        const liveQty = Number(row.live_qty || 0);
        const cached = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/stockAutomation.js:622:33"),





        [loc.location_type, loc.location_id, row.product_name, row.batch_no]);

        if (!cached) continue;
        const drift = Math.abs(liveQty - Number(cached.closing_qty || 0));
        if (drift > tolerance) {
          await logAction('drift_repair', loc.location_id, row.product_name, drift, {
            cached: Number(cached.closing_qty || 0), live: liveQty, locationType: loc.location_type
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

  const minQty = Number(await getConfig('warehouse_min_qty', '20'));
  const reorderQty = Number(await getConfig('warehouse_reorder_qty', '50'));

  const lowWarehouse = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:665:34"),




  [minQty]);


  if (lowWarehouse.length === 0) return;

  // Skip products that already have an open warehouse reorder request (last 3 days)
  const openReqs = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:676:35"), []);





  const openKeys = new Set();
  for (const req of openReqs) {
    let items = [];
    try {items = typeof req.items === 'string' ? JSON.parse(req.items || '[]') : req.items || [];} catch {}
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
      await __qd_executePlan(query, __qd_registeredPlan("api/services/stockAutomation.js:703:36"),


      [id, warehouseId,
      `Warehouse reorder: ${rows.length} product${rows.length !== 1 ? 's' : ''} below minimum (${minQty} units) — warehouse reorder from country stock`,
      JSON.stringify(rows.map((r) => ({
        product_name: r.product_name, productName: r.product_name,
        quantity: reorderQty, unit: 'units', current_qty: Number(r.closing_qty || 0)
      })))]);


      const wLabel = warehouseId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

  const branchStocks = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/stockAutomation.js:744:37"), []);





  const productMap = new Map();
  for (const row of branchStocks) {
    if (!productMap.has(row.product_name)) productMap.set(row.product_name, []);
    productMap.get(row.product_name).push({ branchId: row.branch_id, qty: Number(row.closing_qty || 0) });
  }

  const suggestions = [];

  for (const [product, branches] of productMap.entries()) {
    if (branches.length < 2) continue;
    const totalQty = branches.reduce((s, b) => s + b.qty, 0);
    const avgQty = totalQty / branches.length;
    if (avgQty < 2) continue;

    const surplus = branches.filter((b) => b.qty > avgQty * surplusRatio && b.qty > minThreshold * 2);
    const deficits = branches.filter((b) => b.qty < minThreshold && b.qty < avgQty * 0.5);

    for (const src of surplus) {
      for (const dst of deficits) {
        const suggestQty = Math.floor((src.qty - avgQty) / 2);
        if (suggestQty <= 0) continue;
        suggestions.push({
          product, avgQty: Math.round(avgQty),
          from: src.branchId, fromQty: src.qty,
          to: dst.branchId, toQty: dst.qty,
          suggestQty
        });
      }
    }
  }

  if (suggestions.length === 0) return;

  const topN = suggestions.slice(0, 10);
  const lines = topN.map((s) =>
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
  // Optional independent quarantine; default unchanged. Never set by startup.
  if (!healthDigestEnabled(process.env)) return;
  const enabled = await getConfig('health_digest_enabled', 'true');
  if (enabled !== 'true') return;

  const today = new Date().toISOString().slice(0, 10);
  const alertPolicy = await getStockAlertPolicy();

  const [expiredRows, lowStockRows, stuckRows, pendingRows, inTransitRows, writeOffRows] = await Promise.all([__qd_executePlan(
    getMany, __qd_registeredPlan("api/services/stockAutomation.js:813:38"),

    [today]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/services/stockAutomation.js:817:39"),


    [alertPolicy.lowStockThreshold]), __qd_executePlan(

    getMany, __qd_registeredPlan("api/services/stockAutomation.js:822:40"), []), __qd_executePlan(



    getMany, __qd_registeredPlan("api/services/stockAutomation.js:826:41"), []), __qd_executePlan(



    getMany, __qd_registeredPlan("api/services/stockAutomation.js:830:42"), []), __qd_executePlan(





    getMany, __qd_registeredPlan("api/services/stockAutomation.js:836:43"), [])]





  );

  const expiredBatches = Number(expiredRows[0]?.cnt || 0);
  const expiredQty = Number(expiredRows[0]?.qty || 0);
  const lowStockCount = Number(lowStockRows[0]?.cnt || 0);
  const stuckCount = Number(stuckRows[0]?.cnt || 0);
  const pendingCount = Number(pendingRows[0]?.cnt || 0);
  const inTransitCount = Number(inTransitRows[0]?.cnt || 0);
  const inTransitQty = Number(inTransitRows[0]?.total_qty || 0);
  const writeOffValue = parseFloat(Number(writeOffRows[0]?.value || 0).toFixed(2));

  const digest = [
  `📅 Stock Health Digest — ${today}`,
  ``,
  expiredBatches > 0 ?
  `🔴 ${expiredBatches} expired batch(es) | ${expiredQty} units | pending GM write-off approval` :
  `✅ No expired batches awaiting write-off`,
  lowStockCount > 0 ?
  `🟡 ${lowStockCount} branch(es) with low stock (< ${alertPolicy.lowStockThreshold} units per product)` :
  `✅ All branches above critical stock threshold`,
  stuckCount > 0 ?
  `⚠️  ${stuckCount} transfer(s) approved but not dispatched for > 8 hours — stock is reserved` :
  `✅ No stuck approved transfers`,
  pendingCount > 0 ?
  `⏳ ${pendingCount} transfer(s) awaiting GM approval` :
  `✅ No transfers pending approval`,
  `📦 ${inTransitCount} transfer(s) in transit (${inTransitQty} units on the road)`,
  writeOffValue > 0 ?
  `💰 Write-off exposure: N$${writeOffValue.toLocaleString()} DP value pending approval` :
  null].
  filter(Boolean).join('\n');

  await notify('gm_alert', 'gm', '📊 Morning Stock Health Digest', digest, 'info');
  await notify('stock_alert', 'stock', '📊 Morning Stock Health Digest', digest, 'info');

  await logAction('health_digest', null, null, null, {
    expiredBatches, expiredQty, lowStockCount, stuckCount, pendingCount, inTransitCount, inTransitQty, writeOffValue
  });

  console.log(`[automation] health-digest: sent (expired=${expiredBatches}, lowStock=${lowStockCount}, stuck=${stuckCount}, inTransit=${inTransitCount})`);
}
