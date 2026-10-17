import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan, replaceSearchPlaceholder as __qd_replaceSearchPlaceholder } from "./services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { query, getMany, getOne, withTransaction } from './db.js';
import { branchSearchPredicate } from './services/queryDescriptors.js';
import { recomputeLocationBalances, recomputeInventoryBalance, inferLocationType } from './services/stockEngine.js';
import { branchSearchTerms } from './_lib/branchUtils.js';
import { branchLayers, takeLayers } from './services/stockCostLayers.js';
import { movementSaleEvidence } from './services/saleEvidence.js';
import { businessDay, businessDatePredicate, validateBusinessDates } from './services/businessDates.js';
import { classifySaleCostEvidence } from '../shared/saleCostEvidence.js';
import { stockLedgerPage } from './services/stockLedgerPage.js';

async function deductBranchBatchTx(client, batch, quantity) {
  const layers = branchLayers(batch);
  takeLayers(layers, quantity);
  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:15:0"),

  [quantity, batch.id, JSON.stringify({ ...batch.metadata, cost_layers: layers.filter((layer) => layer.quantity > 0) })]);
}

function normalizeMovement(row) {
  if (!row) return null;
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return {
    id: row.id,
    warehouseId: row.warehouse_id, warehouse_id: row.warehouse_id,
    inventoryId: row.inventory_id, inventory_id: row.inventory_id,
    productId: row.product_id, product_id: row.product_id,
    productName: row.product_name, product_name: row.product_name,
    batchNo: row.batch_no, batch_no: row.batch_no,
    expiryDate: row.expiry_date ? row.expiry_date instanceof Date ? row.expiry_date.toISOString() : row.expiry_date : null,
    expiry_date: row.expiry_date ? row.expiry_date instanceof Date ? row.expiry_date.toISOString() : row.expiry_date : null,
    movementType: row.movement_type, movement_type: row.movement_type,
    quantity: Number(row.quantity || 0),
    balanceAfter: row.balance_after !== null ? Number(row.balance_after) : null,
    reference: row.reference || '',
    referenceId: row.reference_id || row.reference || '', reference_id: row.reference_id || row.reference || '',
    sourceLocation: row.source_location || '', source_location: row.source_location || '',
    destinationLocation: row.destination_location || '', destination_location: row.destination_location || '',
    location: row.location || row.source_location || '',
    notes: row.notes || '',
    metadata: row.metadata || null,
    ...movementSaleEvidence(row),
    createdBy: row.created_by || '', created_by: row.created_by || '',
    createdAt: createdAt, created_at: createdAt,
    status: row.status || null,
    approvedBy: row.approved_by || null, approved_by: row.approved_by || null,
    write_off_reason: row.write_off_reason || null,
    disposal_status: row.disposal_status || null,
    disposed_by: row.disposed_by || null,
    disposed_at: row.disposed_at ? row.disposed_at instanceof Date ? row.disposed_at.toISOString() : row.disposed_at : null
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const branchScope = getBranchScope(req.user);

  try {
    if (req.method === 'GET') {
      const readers = ['admin', 'super_admin', 'superadmin', 'gm', 'general_manager', 'director', 'finance', 'finance_manager',
      'mis', 'stock', 'stock_manager', 'warehouse', 'warehouse_manager', 'branch', 'branch_manager', 'branch_staff'];
      if (!readers.includes(String(req.user.role || '').toLowerCase()))
      return res.status(403).json({ success: false, error: 'Staff stock evidence access required' });
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.searchParams.get('page') === '1') {
        try {return res.json(await stockLedgerPage(url, branchScope));}
        catch (error) {
          if (error.status) return res.status(error.status).json({ success: false, error: error.message });
          throw error;
        }
      }
      const warehouseId = url.searchParams.get('warehouse');
      const productId = url.searchParams.get('product');
      const requestedBranch = url.searchParams.get('branch');
      // For scoped roles: if requestedBranch is supplied, validate it's in their allowed list
      let branch;
      if (branchScope.enforced) {
        if (requestedBranch && branchScope.branches.includes(requestedBranch)) {
          branch = requestedBranch;
        } else if (!requestedBranch) {
          branch = null; // will query all allowed branches via ANY
        } else {
          // requestedBranch is outside user's scope
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      } else {
        branch = requestedBranch;
      }
      const movementType = url.searchParams.get('type');
      const statusFilter = url.searchParams.get('status');
      const dateFrom = url.searchParams.get('date_from');
      const dateTo = url.searchParams.get('date_to');
      validateBusinessDates(dateFrom, dateTo);
      const referenceIdFilter = url.searchParams.get('reference_id');
      const search = url.searchParams.get('search')?.trim();
      const productNameFilter = url.searchParams.get('product_name')?.trim();
      const batchFilter = url.searchParams.get('batch_no')?.trim();
      const locationFilter = url.searchParams.get('location')?.trim();
      if (branchScope.enforced && locationFilter && !branchScope.branches.includes(locationFilter)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const searchPredicate = `(id ILIKE $SEARCH ESCAPE '\\' OR product_name ILIKE $SEARCH ESCAPE '\\'
        OR batch_no ILIKE $SEARCH ESCAPE '\\' OR reference_id ILIKE $SEARCH ESCAPE '\\'
        OR source_location ILIKE $SEARCH ESCAPE '\\' OR destination_location ILIKE $SEARCH ESCAPE '\\'
        OR metadata->'sale_evidence'->>'receipt_no' ILIKE $SEARCH ESCAPE '\\'
        OR metadata->'sale_evidence'->>'movement_id' ILIKE $SEARCH ESCAPE '\\'
        OR metadata->'sale_evidence'->>'branch_movement_id' ILIKE $SEARCH ESCAPE '\\')`;
      const addSearch = (conditions, params, isBranch = false) => {
        for (const [column, term] of [['product_name', productNameFilter], ['batch_no', batchFilter]]) {
          if (term) {params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`);conditions.push(__qd_registeredPlan("api/stock-movements.js:119:7", [column, params.length]));}
        }
        if (locationFilter && !isBranch) {params.push(locationFilter);conditions.push(__qd_registeredPlan("api/stock-movements.js:121:8", [params.length, params.length]));}
        if (!search) return;
        params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
        const predicate = isBranch ? branchSearchPredicate(__qd_registeredPlan("api/stock-movements.js:124:9")) : __qd_registeredPlan("api/stock-movements.js:124:10");
        conditions.push(__qd_replaceSearchPlaceholder(predicate, `$${params.length}`));
      };
      // Fix #4: validate limit — reject negative, NaN, and non-finite values with 400;
      // clamp the accepted range to [1, 1000] to prevent oversized DB queries.
      const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10);
      if (Number.isNaN(rawLimit) || rawLimit < 1) {
        return res.status(400).json({ success: false, error: 'Invalid limit parameter: must be a positive integer between 1 and 1000.' });
      }
      const safeLimit = Math.min(rawLimit, 1000);

      // Scoped roles never access warehouse-level movements
      let rows;
      if (branchScope.enforced) {
        rows = [];
      } else if (warehouseId) {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock-movements.js:141:1"),

        [warehouseId, safeLimit]);

      } else if (productId) {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock-movements.js:146:2"),

        [productId, safeLimit]);

      } else if (!branch) {
        rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock-movements.js:151:3"),

        [safeLimit]);

      } else {
        rows = [];
      }

      let branchMovements = [];
      const fmtDt = (d) => d instanceof Date ? d.toISOString() : d;
      try {
        // Build the list of branch candidates to query
        let branchCandidates;
        if (branchScope.enforced) {
          // Scoped user: query all their allowed branches (or the specific one they requested)
          const targetBranches = branch ? [branch] : branchScope.branches;
          if (targetBranches.length === 0) {
            branchMovements = [];
          } else {
            // Expand branch ids to normalized candidates for fuzzy match
            branchCandidates = targetBranches.flatMap((b) => branchSearchTerms(b));
          }
        } else if (branch) {
          branchCandidates = branchSearchTerms(branch);
        }

        if (branchCandidates && branchCandidates.length > 0) {
          const bimParams = [branchCandidates];
          const bimWhere = [__qd_registeredPlan("api/stock-movements.js:178:4")];
          if (movementType) {bimParams.push(movementType);bimWhere.push(__qd_registeredPlan("api/stock-movements.js:179:5", [bimParams.length]));}
          if (dateFrom) {bimParams.push(dateFrom);bimWhere.push(businessDatePredicate('created_at', `$${bimParams.length}`));}
          if (dateTo) {bimParams.push(dateTo);bimWhere.push(businessDatePredicate('created_at', `$${bimParams.length}`, true));}
          if (referenceIdFilter) {bimParams.push(referenceIdFilter);bimWhere.push(__qd_registeredPlan("api/stock-movements.js:182:6", [bimParams.length]));}
          addSearch(bimWhere, bimParams, true);
          bimParams.push(safeLimit);

          const bimRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock-movements.js:187:11", [__qd_joinPlans(




            bimWhere, "and"),
          bimParams.length]),
          bimParams);


          branchMovements = bimRows.map((r) => ({
            id: r.id,
            productName: r.product_name, product_name: r.product_name,
            batchNo: r.batch_no, batch_no: r.batch_no,
            expiryDate: null, expiry_date: null,
            movementType: r.movement_type, movement_type: r.movement_type,
            quantity: Number(r.quantity || 0),
            unit_price: r.unit_price != null ? Number(r.unit_price) : null,
            unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
            unit_dp: r.unit_price != null ? Number(r.unit_price) : null,
            location: r.branch_id,
            sourceLocation: r.source_branch_id || r.branch_id, source_location: r.source_branch_id || r.branch_id,
            destinationLocation: r.destination_branch_id || '', destination_location: r.destination_branch_id || '',
            referenceId: r.reference_id, reference_id: r.reference_id,
            notes: r.notes,
            saleType: null, sale_type: null,
            createdBy: r.created_by, created_by: r.created_by,
            createdAt: fmtDt(r.created_at), created_at: fmtDt(r.created_at),
            status: 'posted',
            metadata: r.metadata,
            ...movementSaleEvidence(r)
          }));
        } else if (!branchScope.enforced && !branch) {
          // No branch filter, non-scoped user — fall back to stock_movements
          const bmParams = [];
          const bmWhere = [];
          if (movementType) {bmParams.push(movementType);bmWhere.push(__qd_registeredPlan("api/stock-movements.js:222:14", [bmParams.length]));}
          if (statusFilter) {bmParams.push(statusFilter);bmWhere.push(__qd_registeredPlan("api/stock-movements.js:223:15", [bmParams.length]));}
          if (dateFrom) {bmParams.push(dateFrom);bmWhere.push(businessDatePredicate('created_at', `$${bmParams.length}`));}
          if (dateTo) {bmParams.push(dateTo);bmWhere.push(businessDatePredicate('created_at', `$${bmParams.length}`, true));}
          if (referenceIdFilter) {bmParams.push(referenceIdFilter);bmWhere.push(__qd_registeredPlan("api/stock-movements.js:226:16", [bmParams.length]));}
          addSearch(bmWhere, bmParams);
          let bmQuery = __qd_registeredPlan("api/stock-movements.js:228:12");
          if (bmWhere.length > 0) bmQuery = __qd_joinPlans([bmQuery, __qd_joinPlans([__qd_registeredPlan("api/stock-movements.js:229:13"), __qd_joinPlans(bmWhere, "and")], "empty")], "empty");
          bmParams.push(safeLimit);
          bmQuery = __qd_joinPlans([bmQuery, __qd_registeredPlan("api/stock-movements.js:231:17", [bmParams.length])], "empty");

          const bmRows = await __qd_executePlan(getMany, bmQuery, bmParams);
          branchMovements = bmRows.map((r) => ({
            id: r.id,
            productName: r.product_name, product_name: r.product_name,
            batchNo: r.batch_no, batch_no: r.batch_no,
            expiryDate: r.expiry_date ? fmtDt(r.expiry_date) : null,
            expiry_date: r.expiry_date ? fmtDt(r.expiry_date) : null,
            movementType: r.movement_type, movement_type: r.movement_type,
            quantity: Number(r.quantity || 0),
            unit_price: r.unit_dp != null ? Number(r.unit_dp) : null,
            unitPrice: r.unit_dp != null ? Number(r.unit_dp) : null,
            unit_dp: r.unit_dp != null ? Number(r.unit_dp) : null,
            location: r.source_location || '',
            sourceLocation: r.source_location, source_location: r.source_location,
            destinationLocation: r.destination_location, destination_location: r.destination_location,
            referenceId: r.reference_id, reference_id: r.reference_id,
            notes: r.notes,
            saleType: r.sale_type || null, sale_type: r.sale_type || null,
            createdBy: r.created_by, created_by: r.created_by,
            createdAt: fmtDt(r.created_at), created_at: fmtDt(r.created_at),
            status: r.status || null,
            approved_by: r.approved_by || null,
            write_off_reason: r.write_off_reason || null,
            disposal_status: r.disposal_status || null,
            disposed_by: r.disposed_by || null,
            disposed_at: r.disposed_at ? fmtDt(r.disposed_at) : null,
            metadata: r.metadata,
            ...movementSaleEvidence(r)
          }));
        }
      } catch (bmErr) {
        console.error('[stock-movements] branch movements query error:', bmErr.message);
        throw bmErr; // Never present a failed ledger read as an empty successful report.
      }

      const warehouseNormalized = rows.map(normalizeMovement).filter(Boolean);
      const warehouseMatches = warehouseNormalized.filter((row) => {
        if (branch) return false;
        if (search && ![row.id, row.product_name, row.batch_no, row.reference_id, row.source_location, row.destination_location, row.receipt_no].
        some((value) => String(value || '').toLowerCase().includes(search.toLowerCase()))) return false;
        if (productNameFilter && !String(row.product_name || '').toLowerCase().includes(productNameFilter.toLowerCase())) return false;
        if (batchFilter && !String(row.batch_no || '').toLowerCase().includes(batchFilter.toLowerCase())) return false;
        if (locationFilter && ![row.source_location, row.destination_location, row.location].includes(locationFilter)) return false;
        if (dateFrom || dateTo) {
          const day = businessDay(new Date(row.created_at));
          if (dateFrom && day < dateFrom || dateTo && day > dateTo) return false;
        }
        return !movementType || row.movement_type === movementType;
      });
      const combined = [...warehouseMatches, ...branchMovements].sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || 0);
        const db = new Date(b.createdAt || b.created_at || 0);
        return db - da;
      }).slice(0, safeLimit);

      // Read exact immutable allocation evidence for older movements too.
      // Mirror IDs come from captured identity, never product/batch-name matching.
      const identities = combined.map((row) => row.metadata?.sale_evidence?.movement_id || row.id);
      if (identities.length) {
        const allowedOwners = branchScope.enforced ? branchScope.branches.flatMap(branchSearchTerms) : null;
        const allocations = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock-movements.js:293:18"),


        [identities, allowedOwners]);
        const byMovement = new Map();
        for (const allocation of allocations) {
          const list = byMovement.get(allocation.movement_id) || [];
          list.push(allocation);byMovement.set(allocation.movement_id, list);
        }
        for (const row of combined) {
          const parts = byMovement.get(row.metadata?.sale_evidence?.movement_id || row.id);
          if (!parts?.length) continue;
          const totalQty = parts.reduce((sum, part) => sum + Number(part.quantity), 0);
          if (Math.abs(totalQty - Math.abs(row.quantity)) > 1e-8 || totalQty <= 0) continue;
          const unit = (field) => parts.every((part) => {
            const n = part.snapshot?.[field];
            return n != null && n !== '' && Number.isFinite(Number(n)) && (
            Number(n) > 0 || Number(n) === 0 && part.snapshot?.zeroCostApproved === true);
          }) ? parts.reduce((sum, part) => sum + Number(part.quantity) * Number(part.snapshot[field]), 0) / totalQty : null;
          row.original_received_dpc = unit('unit_dp');
          row.original_received_cost = unit('unit_cost');
          row.cost_evidence_status = classifySaleCostEvidence({
            originalReceivedDPC: row.original_received_dpc, originalReceivedCost: row.original_received_cost,
            zeroCostApproved: parts.every((part) => part.snapshot?.zeroCostApproved === true)
          });
        }
      }
      return res.json({ success: true, movements: combined, total: combined.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const movType = body.movementType || body.movement_type || body.type || 'adjustment';
      const productName = body.productName || body.product_name || '';
      const qty = Number(body.quantity || 0);
      const notes = body.notes || null;
      const createdBy = movType === 'write_off' ?
      req.user.fullName || req.user.full_name || req.user.username || req.user.sub || req.user.id :
      body.createdBy || body.created_by || null;

      if (['write_off', 'sale', 'return', 'field_use', 'received', 'warehouse_dispatch', 'short_receipt'].includes(movType)) {
        const id = `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const referenceId = body.reference_id || body.referenceId || null;
        const batchNo = body.batch_no || body.batchNo || null;
        const expiryDate = body.expiry_date || body.expiryDate || null;
        const srcLoc = body.source_location || body.sourceLocation || null;
        const destLoc = body.destination_location || body.destinationLocation || null;
        const srcLocType = body.source_location_type || inferLocationType(srcLoc);
        const dstLocType = body.destination_location_type || inferLocationType(destLoc);
        const branchId = srcLoc || destLoc;
        // Every ordinary write-off is a request, regardless of client status or
        // location type. Only the authenticated approval path may deduct stock.
        const forceApproval = movType === 'write_off';
        const movStatus = body.status === 'pending_approval' || forceApproval ?
        'pending_approval' : 'posted';

        if (branchScope.enforced) {
          // Branch users cannot post warehouse_dispatch movements
          if (movType === 'warehouse_dispatch') {
            return res.status(403).json({ success: false, error: 'Access denied: cannot post warehouse dispatch movements' });
          }
          // For outbound movements (write_off, sale, field_use, return): check source branch
          // For inbound movements (received, short_receipt): check destination branch
          const primaryBranchLoc = movType === 'received' || movType === 'short_receipt' ? destLoc || srcLoc : srcLoc || destLoc;
          if (!primaryBranchLoc || !branchScope.branches.includes(primaryBranchLoc)) {
            return res.status(403).json({ success: false, error: 'Access denied: cannot post movement for this branch' });
          }
        }

        // For pending write-offs: insert record only (no stock deduction — GM must approve first)
        // warehouse_dispatch is a warehouse-level outbound — no branch mirror needed here
        const needsBranchMirror = branchId && ['write_off', 'sale', 'field_use', 'return'].includes(movType) && movStatus !== 'pending_approval';
        // Extract write-off reason from explicit field or first segment of notes
        const rawReason = body.reason || body.write_off_reason || null;
        const woReason = rawReason || (movType === 'write_off' && notes ? notes.split(' — ')[0].split('|')[0].trim() : null);
        // Write-offs go into a disposal queue immediately (unless pending GM approval)
        const disposalStatus = movType === 'write_off' && movStatus === 'posted' ? 'pending_disposal' : null;

        await withTransaction(async (client) => {
          // Fix #5: Idempotency guard for duplicate receipts — inside the transaction with
          // FOR UPDATE so two concurrent receipt requests serialise on this row lock and
          // only one succeeds. The check is on request status (not movement count) so all
          // items in a legitimate multi-item receipt can still be posted in the same call.
          //
          // Critically, after the guard passes we IMMEDIATELY flip the row to 'received'
          // within this transaction. The second concurrent request blocks on the FOR UPDATE
          // lock; once the first commits, the second reads status='received' and is rejected.
          // Without this update the lock is useless — both requests would see the same
          // pre-receipt status and both would commit.
          if (movType === 'received' && referenceId) {
            const reqRow = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:384:19"),

            [referenceId]);

            if (reqRow.rows[0]?.status === 'received') {
              const dupErr = new Error('This stock request has already been received. Duplicate receipt prevented to protect inventory accuracy.');
              dupErr.statusCode = 409;
              throw dupErr;
            }
            // Atomically claim the receipt slot — any concurrent transaction will now
            // see status='received' once this one commits and be rejected above.
            if (reqRow.rows[0]) {
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:396:20"),

              [referenceId]);

            }
          }

          // Fix #7: Sufficiency guard for branch outward deductions.
          // Lock the candidate batch rows with FOR UPDATE before reading their quantities
          // (matching the warehouse_dispatch guard pattern) so that two concurrent
          // sale/write_off/field_use requests serialise on the same row locks instead of
          // both reading the same positive aggregate and both passing the check.
          // Summing in JS over the locked rows is intentional — PostgreSQL forbids
          // FOR UPDATE on aggregate-only selects.
          if (['write_off', 'sale', 'field_use'].includes(movType) &&
          srcLocType === 'branch' && srcLoc && qty > 0 &&
          movStatus !== 'pending_approval') {
            const branchCandidates = branchSearchTerms(srcLoc);
            const lockedBatches = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:414:21"),







            [branchCandidates, productName]);

            const available = lockedBatches.rows.reduce(
              (sum, r) => sum + Number(r.quantity ?? 0), 0
            );
            if (available < qty) {
              const insuffErr = new Error(
                `Insufficient branch stock for "${productName}" at ${srcLoc}: ` +
                `${available} unit${available !== 1 ? 's' : ''} available, ${qty} requested. ` +
                `Adjust the quantity or restock this branch first.`
              );
              insuffErr.statusCode = 409;
              throw insuffErr;
            }
          }

          // ── Availability guard for warehouse_dispatch ─────────────────────────
          // Check that the source warehouse can cover the requested quantity at the
          // moment of insertion. This closes the race window between the frontend
          // FEFO batch lookup (done when the modal opens) and the user clicking
          // Confirm — another concurrent dispatch may have consumed stock in between.
          //
          // Implementation notes:
          //   • FOR UPDATE is applied to row-level queries, not aggregates — PostgreSQL
          //     forbids FOR UPDATE on aggregate-only selects.  Rows are locked individually
          //     and summed in JS instead.
          //   • stock_batches is the FEFO-authoritative source (fefoDeductStockBatches
          //     deducts from this table).  warehouse_inventory is checked as a fallback
          //     only when stock_batches has no matching rows, preventing double-counting.
          if (movType === 'warehouse_dispatch' && srcLoc && productName && qty > 0) {
            // ── Primary: lock FEFO batch rows and sum in JS ───────────────────
            const batchParams = batchNo ?
            [srcLoc, productName, batchNo] :
            [srcLoc, productName];
            const batchFilter = batchNo ?
            `AND LOWER(TRIM(COALESCE(batch_no, ''))) = LOWER(TRIM($3))` :
            '';
            const batchRows = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:459:22", [






            batchFilter]),

            batchParams);

            const batchTotal = batchRows.rows.reduce(
              (sum, r) => sum + Number(r.remaining_quantity ?? 0), 0
            );

            // ── Fallback: warehouse_inventory (only when no FEFO batches exist) ─
            let available = batchTotal;
            if (batchTotal === 0) {
              const invParams = batchNo ?
              [srcLoc, productName, batchNo] :
              [srcLoc, productName];
              const invFilter = batchNo ?
              `AND LOWER(TRIM(COALESCE(batch_no, ''))) = LOWER(TRIM($3))` :
              '';
              const invRows = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:483:23", [





              invFilter]),

              invParams);

              available = invRows.rows.reduce(
                (sum, r) => sum + Number(r.quantity ?? 0), 0
              );
            }

            if (available < qty) {
              const shortfall = qty - available;
              const batchNote = batchNo ? ` (batch ${batchNo})` : '';
              const shortfallErr = new Error(
                `Insufficient stock in ${srcLoc} for "${productName}"${batchNote}: ` +
                `${available} unit${available !== 1 ? 's' : ''} available, ${qty} requested ` +
                `(${shortfall} unit${shortfall !== 1 ? 's' : ''} short). ` +
                `Select a different warehouse or update stock levels first.`
              );
              shortfallErr.statusCode = 422;
              throw shortfallErr;
            }
          }

          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:512:24"),






          [id, productName, batchNo, expiryDate, qty, movType,
          srcLoc, srcLocType, destLoc, dstLocType, referenceId, notes, createdBy, movStatus,
          woReason, disposalStatus]);

          if (needsBranchMirror) {
            // For 'return' movements: branch is the DESTINATION (customer → branch), so use destLoc.
            // For outward types (sale, write_off, field_use): branch is the SOURCE, use srcLoc.
            const bimBranchId = movType === 'return' && dstLocType === 'branch' && destLoc ? destLoc : branchId;
            const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:528:25"),


            [bimId, bimBranchId, movType, productName, batchNo || '', qty, referenceId, notes, createdBy]);


            // ── Outward: FEFO-deduct from branch_inventory_batches (sale, write_off, field_use) ──
            if (['write_off', 'sale', 'field_use'].includes(movType) && srcLocType === 'branch' && srcLoc) {
              // Use the full alias map so hyphenated slugs like 'hochland-park' match
              // rows stored as 'hochlandpark', and _branch-suffix variants also resolve.
              // FOR UPDATE prevents concurrent transactions from reading the same rows.
              const postBranchCandidates = branchSearchTerms(srcLoc);
              let remaining = qty;
              // If a specific batch_no is given, deduct from it first before falling back to FEFO
              if (batchNo) {
                const specificBatch = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:543:26"),







                [postBranchCandidates, productName, batchNo]);

                for (const b of specificBatch.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await deductBranchBatchTx(client, b, take);
                  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:556:27"), [b.id]);
                  remaining -= take;
                }
              }
              if (remaining > 0) {
                const batches = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:562:28", [




                batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : '']),


                batchNo ? [postBranchCandidates, productName, batchNo] : [postBranchCandidates, productName]);

                for (const b of batches.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await deductBranchBatchTx(client, b, take);
                  await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:575:29"), [b.id]);
                  remaining -= take;
                }
              }
            }

            // ── Inward: ADD to branch_inventory_batches for customer→branch returns ──
            if (movType === 'return' && dstLocType === 'branch' && destLoc) {
              const returnBranchId = destLoc;
              // Try to find an existing batch to add back into (prefer matching batch_no)
              let existingBatch = null;
              if (batchNo) {
                const specific = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:588:30"),





                [returnBranchId, productName, batchNo]);

                existingBatch = specific.rows[0] || null;
              }
              if (!existingBatch) {
                const any = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:599:31"),




                [returnBranchId, productName]);

                existingBatch = any.rows[0] || null;
              }
              if (existingBatch) {
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:609:32"),

                [qty, existingBatch.id]);

              } else {
                // No existing batch — create a new entry for the returned stock
                const newBatchId = `BIB-RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:616:33"),



                [newBatchId, returnBranchId, productName, batchNo || null, qty]);

              }
            }
          }
        });
        // Fix #6: await all recomputeLocationBalances calls (previously fire-and-forget)
        // so the 201 response is only sent after inventory_balances are up to date.
        // A client that re-fetches immediately after a successful POST now sees accurate totals.
        const recomputeJobs = [];
        const locType = srcLocType || dstLocType;
        const locId = srcLoc || destLoc;
        if (locType && locId && movStatus !== 'pending_approval') {
          recomputeJobs.push(
            recomputeLocationBalances(locType, locId).catch((e) =>
            console.error('[stockEngine] stock-movements recompute error:', e.message)
            )
          );
        }
        // For 'received': primary loc is the warehouse source — also recompute the
        // destination branch so its balance cache stays current.
        if (movType === 'received' && dstLocType === 'branch' && destLoc) {
          recomputeJobs.push(
            recomputeLocationBalances('branch', destLoc).catch((e) =>
            console.error('[stockEngine] stock-movements received→branch recompute error:', e.message)
            )
          );
        }
        // For 'warehouse_dispatch': also recompute the destination branch so its
        // in-transit balance is reflected immediately.
        if (movType === 'warehouse_dispatch' && dstLocType === 'branch' && destLoc) {
          recomputeJobs.push(
            recomputeLocationBalances('branch', destLoc).catch((e) =>
            console.error('[stockEngine] stock-movements dispatch→branch recompute error:', e.message)
            )
          );
        }
        await Promise.all(recomputeJobs);
        return res.status(201).json({
          success: true,
          id, product_name: productName, productName, quantity: qty, movement_type: movType, movementType: movType,
          batch_no: batchNo, batchNo, notes, created_by: createdBy
        });
      }

      if (branchScope.enforced) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot post warehouse movements' });
      }

      const id = `WMOVE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/stock-movements.js:670:34"),




      [
      id,
      body.warehouseId || body.warehouse_id || null,
      body.inventoryId || body.inventory_id || null,
      body.productId || body.product_id || null,
      productName,
      body.batchNo || body.batch_no || null,
      movType,
      qty,
      body.balanceAfter !== undefined ? Number(body.balanceAfter) : null,
      body.reference || null,
      notes,
      body.metadata ? JSON.stringify(body.metadata) : null,
      createdBy]);



      return res.status(201).json(normalizeMovement(result.rows[0]));
    }

    if (req.method === 'PUT') {
      // Approve or reject pending write-off(s) — GM only
      const body = req.body || {};
      const gmName = req.user?.fullName || req.user?.full_name || req.user?.username || req.user?.id;
      const gmNote = body.notes || body.note || null;
      const action = body.action; // 'approve' | 'reject' | 'approve_all' | 'reject_all'
      const role = String(req.user?.role || '').toLowerCase();
      const approvalRoles = ['gm', 'general_manager', 'admin', 'super_admin', 'superadmin'];
      const isDisposal = ['dispose', 'dispose_all'].includes(action);
      const permittedRoles = isDisposal ? [...approvalRoles, 'director', 'stock', 'stock_manager'] : approvalRoles;
      if (!permittedRoles.includes(role)) {
        return res.status(403).json({ success: false, error: isDisposal ?
          'Stock disposal permission required' : 'GM approval permission required' });
      }

      const approve = async (client, id) => {
        // Fetch the pending record
        const { rows } = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:712:35"),

        [id]);

        if (rows.length === 0) return null;
        const r = rows[0];
        const branchId = r.source_location;
        const productName = r.product_name;
        const batchNo = r.batch_no;
        const qty = Number(r.quantity || 0);
        // Hoist effectiveBranchId so it is accessible in the return value below
        // even when the deduction block is skipped (qty=0 / no productName).
        let effectiveBranchId = branchId;

        // ── Warehouse write-off path ──────────────────────────────────────────
        // If the source is a warehouse, deduct from stock_batches.remaining_quantity
        // (warehouse stock lives in stock_batches, not branch_inventory_batches).
        const sourceLocType = r.source_location_type || inferLocationType(branchId);
        if (sourceLocType === 'warehouse' || sourceLocType === 'country') {
          if (branchId && productName && qty > 0) {
            // Immediately adjust inventory_balances in-transaction.
            // Use the actual sourceLocType (country_stock has location_type='country',
            // not 'warehouse') so the correct row is found and updated.
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:735:36"),








            [qty, branchId, productName, batchNo || null, sourceLocType]);


            // Deduct from stock_batches — specific batch first, then FIFO by expiry
            let remaining = qty;
            if (batchNo) {
              const specific = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:750:37"),






              [branchId, productName, batchNo]);

              for (const b of specific.rows) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(b.remaining_quantity));
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:762:38"),

                [take, b.id]);

                remaining -= take;
              }
            }
            if (remaining > 0) {
              const fifo = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:770:39", [




              batchNo ? `AND LOWER(TRIM(COALESCE(batch_no,''))) != LOWER(TRIM($3))` : '']),

              batchNo ? [branchId, productName, batchNo] : [branchId, productName]);

              for (const b of fifo.rows) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(b.remaining_quantity));
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:782:40"),

                [take, b.id]);

                remaining -= take;
              }
            }

            // Log in warehouse_inventory_movements
            const wimId = `WIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const woReason = r.write_off_reason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:793:41"),



            [wimId, branchId, productName, batchNo || '', qty,
            r.reference_id, (r.notes || woReason || '').trim(), gmName]);

          }

          const derivedReasonWh = r.write_off_reason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:803:42"),







          [gmName, gmNote ? ` | GM: ${gmNote}` : '', derivedReasonWh, id]);

          return { branchId: null, effectiveBranchId: null, warehouseId: branchId };
        }
        // ── End warehouse write-off path ──────────────────────────────────────

        // Deduct from branch_inventory_batches
        if (branchId && productName && qty > 0) {
          // Use the full alias map from branchUtils so that hyphenated slugs like
          // 'hochland-park' correctly resolve to stored forms like 'hochlandpark',
          // and _branch-suffixed variants ('ondangwa_branch') are also covered.
          const branchCandidates = branchSearchTerms(branchId);
          // Lock physical rows before balance rows, matching ordinary sales.
          // Recheck current stock under the locks: submissions do not reserve it.
          const lockedStock = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:825:43"),






          [branchCandidates, productName]);

          const available = lockedStock.rows.reduce((sum, b) => sum + Number(b.quantity), 0);
          if (available < qty) {
            const error = new Error(`Insufficient branch stock for "${productName}" at ${branchId}: ${available} available, ${qty} requested. Write-off remains pending GM approval.`);
            error.statusCode = 409;
            throw error;
          }
          const resolvedRow = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:840:44"),


          [branchCandidates]);

          effectiveBranchId = resolvedRow.rows[0]?.branch_id || branchId;

          // Immediately zero-out inventory_balances for ALL candidate branch-id variants
          // (e.g. both 'ondangwa' and 'ondangwa_branch') inside this transaction so that
          // no stale row can feed the item back on refresh or server-restart backfill.
          if (qty > 0) {
            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:851:45"),








            [qty, branchCandidates, productName, batchNo || null]);

          }

          let remaining = qty;
          if (batchNo) {
            // Use ANY(branchCandidates) so rows stored under any alias form are matched.
            // FOR UPDATE locks the row to prevent race conditions under concurrent approvals.
            const specific = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:868:46"),







            [branchCandidates, productName, batchNo]);

            for (const b of specific.rows) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(b.quantity));
              await deductBranchBatchTx(client, b, take);
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:881:47"), [b.id]);
              remaining -= take;
            }
          }
          if (remaining > 0) {
            // FOR UPDATE prevents concurrent approvals from reading the same rows and over-deducting.
            const fifo = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:888:48", [




            batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : '']),


            batchNo ? [branchCandidates, productName, batchNo] : [branchCandidates, productName]);

            for (const b of fifo.rows) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(b.quantity));
              await deductBranchBatchTx(client, b, take);
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:901:49"), [b.id]);
              remaining -= take;
            }
          }
          if (remaining > 0) {
            const error = new Error('Branch stock changed during approval. Write-off remains pending GM approval.');
            error.statusCode = 409;
            throw error;
          }
          // Mirror to branch_inventory_movements (use the resolved id so the ledger is consistent)
          const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:913:50"),


          [bimId, effectiveBranchId, productName, batchNo || '', qty, r.reference_id, r.notes, gmName]);

        }
        // Extract reason from notes if not already stored
        const existingReason = r.write_off_reason;
        const derivedReason = existingReason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);

        // Approval records disposal, never a physical warehouse receipt.
        // Returnable goods must use a separate transfer and confirmed receipt.
        const disposalStatus = 'dispose_off';

        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:927:51"),







        [gmName, gmNote ? ` | GM: ${gmNote}` : '', disposalStatus, derivedReason, id]);

        return { branchId: branchId || null, effectiveBranchId: effectiveBranchId || null, warehouseId: null };
      };

      const reject = async (client, id) => {
        const { rowCount } = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock-movements.js:941:52"),


        [gmName, gmNote ? ` | GM rejected: ${gmNote}` : ' | Rejected by GM', id]);

        return rowCount > 0;
      };

      if (action === 'approve' || action === 'reject') {
        const id = body.id;
        if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
        let result = null;
        await withTransaction(async (client) => {
          if (action === 'approve') result = await approve(client, id);else
          await reject(client, id);
        });

        // ── #12 Write-Off Financial Impact Digest ────────────────────────────────
        // Notify Finance portal with the DP value of approved write-offs.
        if (action === 'approve' && result) {
          try {
            const woRow = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock-movements.js:962:53"),


            [id]);

            if (woRow) {
              const dpValue = Number(woRow.unit_dp || 0) * Number(woRow.quantity || 0);
              if (dpValue > 0 || Number(woRow.quantity || 0) > 0) {
                const notifId = `NOTIF-WO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                await __qd_executePlan(query, __qd_registeredPlan("api/stock-movements.js:971:54"),


                [notifId,
                `💸 Write-Off Approved — N$${dpValue.toFixed(2)} DP Loss`,
                `GM ${gmName} approved a write-off: ${woRow.quantity} units of "${woRow.product_name}"` +
                ` (Batch: ${woRow.batch_no || 'N/A'}, Expiry: ${woRow.expiry_date ? String(woRow.expiry_date).slice(0, 10) : 'N/A'}).` +
                ` Branch: ${(woRow.source_location || '').replace(/_/g, ' ')}.` +
                ` Reason: ${woRow.write_off_reason || 'N/A'}.` +
                ` DP value: N$${dpValue.toFixed(2)}.`]);

              }
            }
          } catch (finErr) {
            console.warn('[stock-movements] write-off finance notification error:', finErr.message);
          }
        }
        // ── End financial impact digest ───────────────────────────────────────────

        // Await synchronously so inventory_balances is up-to-date before the
        // client receives the success response and re-fetches inventory.
        // Recompute for BOTH branch-id variants (e.g. 'ondangwa' AND 'ondangwa_branch')
        // because normalization failures can leave rows under either slug.
        const branchVariants = new Set([result?.branchId, result?.effectiveBranchId].filter(Boolean));
        await Promise.all([
        ...[...branchVariants].map((bid) => recomputeLocationBalances('branch', bid).catch(() => {})),
        result?.warehouseId ? recomputeLocationBalances('warehouse', result.warehouseId).catch(() => {}) : null].
        filter(Boolean));
        return res.json({ success: true });
      }

      if (action === 'approve_all' || action === 'reject_all') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return res.status(400).json({ success: false, error: 'No ids provided' });
        const affectedBranches = new Set();
        const affectedWarehouses = new Set();
        await withTransaction(async (client) => {
          for (const id of ids) {
            if (action === 'approve_all') {
              const result = await approve(client, id);
              if (result?.branchId) affectedBranches.add(result.branchId);
              if (result?.effectiveBranchId) affectedBranches.add(result.effectiveBranchId);
              if (result?.warehouseId) affectedWarehouses.add(result.warehouseId);
            } else {
              await reject(client, id);
            }
          }
        });
        // Await all recomputes before responding so the client sees correct data on refresh
        await Promise.all([
        ...[...affectedBranches].map((bid) => recomputeLocationBalances('branch', bid).catch(() => {})),
        ...[...affectedWarehouses].map((wid) => recomputeLocationBalances('warehouse', wid).catch(() => {}))]
        );
        return res.json({ success: true, count: ids.length });
      }

      // Dispose action — stock manager marks written-off stock as physically disposed
      if (action === 'dispose' || action === 'dispose_all') {
        const disposedBy = gmName;
        const requestedIds = action === 'dispose_all' ?
        Array.isArray(body.ids) ? body.ids : [] :
        body.id ? [body.id] : [];
        if (!requestedIds.length || requestedIds.length > 1000 ||
        requestedIds.some((id) => typeof id !== 'string' || !id.trim())) {
          return res.status(400).json({ success: false, error: 'Provide between 1 and 1000 valid movement IDs' });
        }
        const ids = [...new Set(requestedIds)];
        const scope = branchScope.enforced ?
        branchScope.branches.flatMap(branchSearchTerms).map((s) => s.toLowerCase().replaceAll(' ', '_')) :
        null;
        if (scope && !scope.length) return res.status(403).json({ success: false, error: 'No permitted stock location' });
        const { rowCount } = await __qd_executePlan(query, __qd_registeredPlan("api/stock-movements.js:1042:55"),










        [disposedBy, ids, scope]);

        if (!rowCount) return res.status(409).json({ success: false, disposed: 0,
          requested: ids.length, error: 'No eligible records changed. Refresh: records may already be disposed, awaiting approval, or outside your permitted location.' });
        return res.json({ success: true, disposed: rowCount, requested: ids.length, unchanged: ids.length - rowCount });
      }

      return res.status(400).json({ success: false, error: 'Invalid action — use approve, reject, approve_all, reject_all, dispose, or dispose_all' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock movements API error:', error);
    const status = error.statusCode || 500;
    const message = status < 500 ? error.message : 'Internal server error';
    return res.status(status).json({ success: false, error: message });
  }
}
