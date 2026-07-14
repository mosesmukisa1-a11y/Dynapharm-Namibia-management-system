import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { query, getMany, getOne, withTransaction } from './db.js';
import { recomputeLocationBalances, recomputeInventoryBalance, inferLocationType } from './services/stockEngine.js';
import { branchSearchTerms } from './_lib/branchUtils.js';

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
    expiryDate: row.expiry_date ? (row.expiry_date instanceof Date ? row.expiry_date.toISOString() : row.expiry_date) : null,
    expiry_date: row.expiry_date ? (row.expiry_date instanceof Date ? row.expiry_date.toISOString() : row.expiry_date) : null,
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
    createdBy: row.created_by || '', created_by: row.created_by || '',
    createdAt: createdAt, created_at: createdAt,
    status: row.status || null,
    approvedBy: row.approved_by || null, approved_by: row.approved_by || null,
    write_off_reason: row.write_off_reason || null,
    disposal_status: row.disposal_status || null,
    disposed_by: row.disposed_by || null,
    disposed_at: row.disposed_at ? (row.disposed_at instanceof Date ? row.disposed_at.toISOString() : row.disposed_at) : null,
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
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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
      const referenceIdFilter = url.searchParams.get('reference_id');
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const safeLimit = Number.isNaN(limit) ? 100 : Math.min(limit, 2000);

      // Scoped roles never access warehouse-level movements
      let rows;
      if (branchScope.enforced) {
        rows = [];
      } else if (warehouseId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE warehouse_id = $1 ORDER BY created_at DESC LIMIT $2',
          [warehouseId, safeLimit]
        );
      } else if (productId) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2',
          [productId, safeLimit]
        );
      } else if (!branch) {
        rows = await getMany(
          'SELECT * FROM warehouse_inventory_movements ORDER BY created_at DESC LIMIT $1',
          [safeLimit]
        );
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
            branchCandidates = targetBranches.flatMap(b => {
              const norm = b.toLowerCase().replace(/\s+/g, '_');
              const stripped = norm.replace(/_branch$/, '');
              const res = [norm];
              if (!norm.endsWith('_branch')) res.push(norm + '_branch');
              if (stripped !== norm) res.push(stripped);
              return res;
            });
          }
        } else if (branch) {
          const normBranch = branch.toLowerCase().replace(/\s+/g, '_');
          const stripped = normBranch.replace(/_branch$/, '');
          branchCandidates = [normBranch];
          if (!normBranch.endsWith('_branch')) branchCandidates.push(normBranch + '_branch');
          if (stripped !== normBranch) branchCandidates.push(stripped);
        }

        if (branchCandidates && branchCandidates.length > 0) {
          const bimParams = [branchCandidates];
          const bimWhere = ['LOWER(REPLACE(branch_id, \' \', \'_\')) = ANY($1)'];
          if (movementType) { bimParams.push(movementType); bimWhere.push(`type = $${bimParams.length}`); }
          if (dateFrom) { bimParams.push(dateFrom); bimWhere.push(`created_at >= $${bimParams.length}::timestamp`); }
          if (dateTo) { bimParams.push(dateTo + 'T23:59:59'); bimWhere.push(`created_at <= $${bimParams.length}::timestamp`); }
          if (referenceIdFilter) { bimParams.push(referenceIdFilter); bimWhere.push(`reference = $${bimParams.length}`); }
          bimParams.push(safeLimit);

          const bimRows = await getMany(
            `SELECT id, branch_id, type AS movement_type, product_name, product_code, batch_no, quantity,
                    unit, unit_price, source_branch_id, destination_branch_id, reference AS reference_id,
                    notes, created_by, created_at
             FROM branch_inventory_movements
             WHERE ${bimWhere.join(' AND ')}
             ORDER BY created_at DESC LIMIT $${bimParams.length}`,
            bimParams
          );

          branchMovements = bimRows.map(r => ({
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
          }));
        } else if (!branchScope.enforced && !branch) {
          // No branch filter, non-scoped user — fall back to stock_movements
          const bmParams = [];
          const bmWhere = [];
          if (movementType) { bmParams.push(movementType); bmWhere.push(`movement_type = $${bmParams.length}`); }
          if (statusFilter) { bmParams.push(statusFilter); bmWhere.push(`status = $${bmParams.length}`); }
          if (dateFrom) { bmParams.push(dateFrom); bmWhere.push(`created_at >= $${bmParams.length}::timestamp`); }
          if (dateTo) { bmParams.push(dateTo + 'T23:59:59'); bmWhere.push(`created_at <= $${bmParams.length}::timestamp`); }
          if (referenceIdFilter) { bmParams.push(referenceIdFilter); bmWhere.push(`reference_id = $${bmParams.length}`); }
          let bmQuery = 'SELECT * FROM stock_movements';
          if (bmWhere.length > 0) bmQuery += ' WHERE ' + bmWhere.join(' AND ');
          bmParams.push(safeLimit);
          bmQuery += ` ORDER BY created_at DESC LIMIT $${bmParams.length}`;

          const bmRows = await getMany(bmQuery, bmParams);
          branchMovements = bmRows.map(r => ({
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
          }));
        }
      } catch (bmErr) {
        console.error('[stock-movements] branch movements query error:', bmErr.message);
      }

      const warehouseNormalized = rows.map(normalizeMovement).filter(Boolean);
      const combined = [...warehouseNormalized, ...branchMovements].sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || 0);
        const db = new Date(b.createdAt || b.created_at || 0);
        return db - da;
      }).slice(0, safeLimit);

      return res.json({ success: true, movements: combined, total: combined.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const movType = body.movementType || body.movement_type || body.type || 'adjustment';
      const productName = body.productName || body.product_name || '';
      const qty = Number(body.quantity || 0);
      const notes = body.notes || null;
      const createdBy = body.createdBy || body.created_by || null;

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
        // Allow branch users to submit write-offs pending GM approval.
        // Warehouse and country-stock write-offs ALWAYS require GM approval so
        // the approve handler (not the POST path) can deduct from stock_batches.
        const forceApproval = movType === 'write_off' &&
          (srcLocType === 'warehouse' || srcLocType === 'country');
        const movStatus = (body.status === 'pending_approval' || forceApproval)
          ? 'pending_approval' : 'posted';

        if (branchScope.enforced) {
          // Branch users cannot post warehouse_dispatch movements
          if (movType === 'warehouse_dispatch') {
            return res.status(403).json({ success: false, error: 'Access denied: cannot post warehouse dispatch movements' });
          }
          // For outbound movements (write_off, sale, field_use, return): check source branch
          // For inbound movements (received, short_receipt): check destination branch
          const primaryBranchLoc = (movType === 'received' || movType === 'short_receipt') ? (destLoc || srcLoc) : (srcLoc || destLoc);
          if (!primaryBranchLoc || !branchScope.branches.includes(primaryBranchLoc)) {
            return res.status(403).json({ success: false, error: 'Access denied: cannot post movement for this branch' });
          }
        }

        // Idempotency guard: check the stock request's own status rather than counting
        // existing movements. Counting movements would block every item after the first
        // in a multi-item receipt (all items share the same reference_id). Checking the
        // request status correctly allows all items in a legitimate first submission while
        // blocking any subsequent full re-submission once the request is marked received.
        if (movType === 'received' && referenceId) {
          const reqRow = await query(
            `SELECT status FROM stock_requests WHERE id = $1`,
            [referenceId]
          );
          if (reqRow.rows[0]?.status === 'received') {
            return res.status(409).json({ success: false, error: 'This stock request has already been received. Duplicate receipt prevented to protect inventory accuracy.' });
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
            const batchParams = batchNo
              ? [srcLoc, productName, batchNo]
              : [srcLoc, productName];
            const batchFilter = batchNo
              ? `AND LOWER(TRIM(COALESCE(batch_no, ''))) = LOWER(TRIM($3))`
              : '';
            const batchRows = await client.query(
              `SELECT id, remaining_quantity
               FROM stock_batches
               WHERE (LOWER(TRIM(location)) = LOWER(TRIM($1)) OR LOWER(TRIM(warehouse_id)) = LOWER(TRIM($1)))
                 AND LOWER(TRIM(description)) = LOWER(TRIM($2))
                 AND remaining_quantity > 0
                 AND status != 'expired'
                 ${batchFilter}
               FOR UPDATE`,
              batchParams
            );
            const batchTotal = batchRows.rows.reduce(
              (sum, r) => sum + Number(r.remaining_quantity ?? 0), 0
            );

            // ── Fallback: warehouse_inventory (only when no FEFO batches exist) ─
            let available = batchTotal;
            if (batchTotal === 0) {
              const invParams = batchNo
                ? [srcLoc, productName, batchNo]
                : [srcLoc, productName];
              const invFilter = batchNo
                ? `AND LOWER(TRIM(COALESCE(batch_no, ''))) = LOWER(TRIM($3))`
                : '';
              const invRows = await client.query(
                `SELECT id, quantity
                 FROM warehouse_inventory
                 WHERE LOWER(TRIM(warehouse_id)) = LOWER(TRIM($1))
                   AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
                   AND quantity > 0
                   ${invFilter}
                 FOR UPDATE`,
                invParams
              );
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

          await client.query(
            `INSERT INTO stock_movements
               (id, product_name, batch_no, expiry_date, quantity, movement_type,
                source_location, source_location_type, destination_location, destination_location_type,
                reference_id, notes, created_by, status, write_off_reason, disposal_status,
                movement_date, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW(),NOW())`,
            [id, productName, batchNo, expiryDate, qty, movType,
             srcLoc, srcLocType, destLoc, dstLocType, referenceId, notes, createdBy, movStatus,
             woReason, disposalStatus]
          );
          if (needsBranchMirror) {
            const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await client.query(
              `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
              [bimId, branchId, movType, productName, batchNo || '', qty, referenceId, notes, createdBy]
            );
            if (['write_off', 'sale', 'field_use'].includes(movType)) {
              // Use the full alias map so hyphenated slugs like 'hochland-park' match
              // rows stored as 'hochlandpark', and _branch-suffix variants also resolve.
              const postBranchCandidates = branchSearchTerms(branchId);
              let remaining = qty;
              // If a specific batch_no is given, deduct from it first before falling back to FIFO
              if (batchNo) {
                const specificBatch = await client.query(
                  `SELECT id, quantity FROM branch_inventory_batches
                   WHERE LOWER(REPLACE(branch_id, ' ', '_')) = ANY($1)
                     AND LOWER(product_name) = LOWER($2)
                     AND LOWER(COALESCE(batch_no,'')) = LOWER($3)
                     AND quantity > 0
                   LIMIT 1`,
                  [postBranchCandidates, productName, batchNo]
                );
                for (const b of specificBatch.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
                  await client.query(`DELETE FROM branch_inventory_batches WHERE id = $1 AND quantity <= 0`, [b.id]);
                  remaining -= take;
                }
              }
              if (remaining > 0) {
                const batches = await client.query(
                  `SELECT id, quantity FROM branch_inventory_batches
                   WHERE LOWER(REPLACE(branch_id, ' ', '_')) = ANY($1)
                     AND LOWER(product_name) = LOWER($2)
                     AND quantity > 0
                     ${batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : ''}
                   ORDER BY expiry_date ASC NULLS LAST`,
                  batchNo ? [postBranchCandidates, productName, batchNo] : [postBranchCandidates, productName]
                );
                for (const b of batches.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
                  await client.query(`DELETE FROM branch_inventory_batches WHERE id = $1 AND quantity <= 0`, [b.id]);
                  remaining -= take;
                }
              }
            }
          }
        });
        // Recompute inventory_balances for the primary affected location
        const locType = srcLocType || dstLocType;
        const locId = srcLoc || destLoc;
        if (locType && locId) {
          recomputeLocationBalances(locType, locId).catch(e =>
            console.error('[stockEngine] stock-movements recompute error:', e.message)
          );
        }
        // For 'received': the primary loc resolves to the warehouse source — also recompute
        // the destination branch so its inventory_balances cache stays current.
        if (movType === 'received' && dstLocType === 'branch' && destLoc) {
          recomputeLocationBalances('branch', destLoc).catch(e =>
            console.error('[stockEngine] stock-movements received→branch recompute error:', e.message)
          );
        }
        // For 'warehouse_dispatch': src is warehouse (already recomputed above) — also
        // recompute the destination branch so its in-transit balance is reflected.
        if (movType === 'warehouse_dispatch' && dstLocType === 'branch' && destLoc) {
          recomputeLocationBalances('branch', destLoc).catch(e =>
            console.error('[stockEngine] stock-movements dispatch→branch recompute error:', e.message)
          );
        }
        return res.status(201).json({
          success: true,
          id, product_name: productName, productName, quantity: qty, movement_type: movType, movementType: movType,
          batch_no: batchNo, batchNo, notes, created_by: createdBy,
        });
      }

      if (branchScope.enforced) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot post warehouse movements' });
      }

      const id = `WMOVE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const result = await query(
        `INSERT INTO warehouse_inventory_movements
          (id, warehouse_id, inventory_id, product_id, product_name, batch_no, movement_type, quantity, balance_after, reference, notes, metadata, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         RETURNING *`,
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
          createdBy,
        ]
      );

      return res.status(201).json(normalizeMovement(result.rows[0]));
    }

    if (req.method === 'PUT') {
      // Approve or reject pending write-off(s) — GM only
      const body = req.body || {};
      const gmName = body.approved_by || req.user?.full_name || req.user?.username || 'GM';
      const gmNote = body.notes || body.note || null;
      const action = body.action; // 'approve' | 'reject' | 'approve_all' | 'reject_all'

      const approve = async (client, id) => {
        // Fetch the pending record
        const { rows } = await client.query(
          `SELECT * FROM stock_movements WHERE id = $1 AND movement_type = 'write_off' AND status = 'pending_approval' LIMIT 1`,
          [id]
        );
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
            await client.query(
              `UPDATE inventory_balances
               SET closing_qty = GREATEST(closing_qty - $1, 0),
                   outward_qty = outward_qty + $1,
                   updated_at  = NOW()
               WHERE location_type = $5
                 AND LOWER(REPLACE(location_id,' ','_')) = LOWER(REPLACE($2,' ','_'))
                 AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
                 AND COALESCE(batch_no,'') = COALESCE($4,'')`,
              [qty, branchId, productName, batchNo || null, sourceLocType]
            );

            // Deduct from stock_batches — specific batch first, then FIFO by expiry
            let remaining = qty;
            if (batchNo) {
              const specific = await client.query(
                `SELECT id, remaining_quantity FROM stock_batches
                 WHERE (LOWER(TRIM(location)) = LOWER(TRIM($1)) OR LOWER(TRIM(COALESCE(warehouse_id,''))) = LOWER(TRIM($1)))
                   AND LOWER(TRIM(description)) = LOWER(TRIM($2))
                   AND LOWER(TRIM(COALESCE(batch_no,''))) = LOWER(TRIM($3))
                   AND remaining_quantity > 0
                 ORDER BY expiry_date ASC NULLS LAST FOR UPDATE`,
                [branchId, productName, batchNo]
              );
              for (const b of specific.rows) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(b.remaining_quantity));
                await client.query(
                  `UPDATE stock_batches SET remaining_quantity = remaining_quantity - $1, updated_at = NOW() WHERE id = $2`,
                  [take, b.id]
                );
                remaining -= take;
              }
            }
            if (remaining > 0) {
              const fifo = await client.query(
                `SELECT id, remaining_quantity FROM stock_batches
                 WHERE (LOWER(TRIM(location)) = LOWER(TRIM($1)) OR LOWER(TRIM(COALESCE(warehouse_id,''))) = LOWER(TRIM($1)))
                   AND LOWER(TRIM(description)) = LOWER(TRIM($2))
                   AND remaining_quantity > 0
                   ${batchNo ? `AND LOWER(TRIM(COALESCE(batch_no,''))) != LOWER(TRIM($3))` : ''}
                 ORDER BY expiry_date ASC NULLS LAST FOR UPDATE`,
                batchNo ? [branchId, productName, batchNo] : [branchId, productName]
              );
              for (const b of fifo.rows) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(b.remaining_quantity));
                await client.query(
                  `UPDATE stock_batches SET remaining_quantity = remaining_quantity - $1, updated_at = NOW() WHERE id = $2`,
                  [take, b.id]
                );
                remaining -= take;
              }
            }

            // Log in warehouse_inventory_movements
            const wimId = `WIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const woReason = r.write_off_reason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);
            await client.query(
              `INSERT INTO warehouse_inventory_movements
                 (id, warehouse_id, product_name, batch_no, movement_type, quantity, reference, notes, created_by, created_at)
               VALUES ($1, $2, $3, $4, 'write_off', $5, $6, $7, $8, NOW())`,
              [wimId, branchId, productName, batchNo || '', qty,
               r.reference_id, (r.notes || woReason || '').trim(), gmName]
            );
          }

          const derivedReasonWh = r.write_off_reason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);
          await client.query(
            `UPDATE stock_movements
             SET status = 'approved', approved_by = $1,
                 notes = COALESCE(notes,'') || $2,
                 disposal_status = 'dispose_off',
                 write_off_reason = COALESCE(write_off_reason, $3),
                 updated_at = NOW()
             WHERE id = $4`,
            [gmName, gmNote ? ` | GM: ${gmNote}` : '', derivedReasonWh, id]
          );
          return { branchId: null, effectiveBranchId: null, warehouseId: branchId };
        }
        // ── End warehouse write-off path ──────────────────────────────────────

        // Deduct from branch_inventory_batches
        if (branchId && productName && qty > 0) {
          // Use the full alias map from branchUtils so that hyphenated slugs like
          // 'hochland-park' correctly resolve to stored forms like 'hochlandpark',
          // and _branch-suffixed variants ('ondangwa_branch') are also covered.
          const branchCandidates = branchSearchTerms(branchId);
          const resolvedRow = await client.query(
            `SELECT DISTINCT branch_id FROM branch_inventory_batches
             WHERE LOWER(REPLACE(branch_id,' ','_')) = ANY($1) LIMIT 1`,
            [branchCandidates]
          );
          effectiveBranchId = resolvedRow.rows[0]?.branch_id || branchId;

          // Immediately zero-out inventory_balances for ALL candidate branch-id variants
          // (e.g. both 'ondangwa' and 'ondangwa_branch') inside this transaction so that
          // no stale row can feed the item back on refresh or server-restart backfill.
          if (qty > 0) {
            await client.query(
              `UPDATE inventory_balances
               SET closing_qty = GREATEST(closing_qty - $1, 0),
                   outward_qty = outward_qty + $1,
                   updated_at  = NOW()
               WHERE location_type = 'branch'
                 AND LOWER(REPLACE(location_id,' ','_')) = ANY($2)
                 AND LOWER(TRIM(product_name)) = LOWER(TRIM($3))
                 AND COALESCE(batch_no,'') = COALESCE($4,'')`,
              [qty, branchCandidates, productName, batchNo || null]
            );
          }

          let remaining = qty;
          if (batchNo) {
            // Use ANY(branchCandidates) so rows stored under any alias form are matched.
            // FOR UPDATE locks the row to prevent race conditions under concurrent approvals.
            const specific = await client.query(
              `SELECT id, quantity FROM branch_inventory_batches
               WHERE LOWER(REPLACE(branch_id,' ','_')) = ANY($1)
                 AND LOWER(product_name) = LOWER($2)
                 AND LOWER(COALESCE(batch_no,'')) = LOWER($3)
                 AND quantity > 0
               ORDER BY expiry_date ASC NULLS LAST
               LIMIT 1 FOR UPDATE`,
              [branchCandidates, productName, batchNo]
            );
            for (const b of specific.rows) {
              const take = Math.min(remaining, Number(b.quantity));
              await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
              await client.query(`DELETE FROM branch_inventory_batches WHERE id = $1 AND quantity <= 0`, [b.id]);
              remaining -= take;
            }
          }
          if (remaining > 0) {
            // FOR UPDATE prevents concurrent approvals from reading the same rows and over-deducting.
            const fifo = await client.query(
              `SELECT id, quantity FROM branch_inventory_batches
               WHERE LOWER(REPLACE(branch_id,' ','_')) = ANY($1)
                 AND LOWER(product_name) = LOWER($2)
                 AND quantity > 0
                 ${batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : ''}
               ORDER BY expiry_date ASC NULLS LAST
               FOR UPDATE`,
              batchNo ? [branchCandidates, productName, batchNo] : [branchCandidates, productName]
            );
            for (const b of fifo.rows) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(b.quantity));
              await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
              await client.query(`DELETE FROM branch_inventory_batches WHERE id = $1 AND quantity <= 0`, [b.id]);
              remaining -= take;
            }
          }
          // Mirror to branch_inventory_movements (use the resolved id so the ledger is consistent)
          const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          await client.query(
            `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
             VALUES ($1,$2,'write_off',$3,$4,$5,$6,$7,$8,NOW())`,
            [bimId, effectiveBranchId, productName, batchNo || '', qty, r.reference_id, r.notes, gmName]
          );
        }
        // Extract reason from notes if not already stored
        const existingReason = r.write_off_reason;
        const derivedReason = existingReason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);

        // Determine if this batch is expired — expired stock is disposed at branch, non-expired is returned to warehouse
        const expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;
        const isExpired = (expiryDate && expiryDate < new Date()) ||
          ['expired'].includes((derivedReason || '').toLowerCase().trim());

        let disposalStatus = 'dispose_off';
        let returnedWarehouseId = null;

        if (!isExpired && qty > 0) {
          // Find the warehouse that last dispatched this product to this branch
          const dispatchSrc = await client.query(
            `SELECT source_location FROM stock_movements
             WHERE movement_type = 'warehouse_dispatch'
               AND LOWER(REPLACE(destination_location,' ','_')) = LOWER(REPLACE($1,' ','_'))
               AND LOWER(product_name) = LOWER($2)
             ORDER BY created_at DESC LIMIT 1`,
            [branchId, productName]
          );
          returnedWarehouseId = dispatchSrc.rows[0]?.source_location || 'country_stock';

          // Try to add quantity back to an existing warehouse_inventory row
          const upd = await client.query(
            `UPDATE warehouse_inventory
             SET quantity = quantity + $1, updated_at = NOW()
             WHERE warehouse_id = $2
               AND LOWER(product_name) = LOWER($3)
               AND LOWER(COALESCE(batch_no,'')) = LOWER($4)`,
            [qty, returnedWarehouseId, productName, batchNo || '']
          );
          if (upd.rowCount === 0) {
            // No matching row — insert a new inventory entry for this product/batch.
            // product_id is NOT NULL: reuse the id from an existing row for this product,
            // falling back to a URL-slug generated from the product name.
            const existingPid = await client.query(
              `SELECT product_id FROM warehouse_inventory
               WHERE LOWER(product_name) = LOWER($1) AND product_id IS NOT NULL LIMIT 1`,
              [productName]
            );
            const productId = existingPid.rows[0]?.product_id
              || productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const wiId = `WI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await client.query(
              `INSERT INTO warehouse_inventory
                 (id, warehouse_id, product_id, product_name, batch_no, expiry_date, quantity, status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', NOW(), NOW())
               ON CONFLICT (warehouse_id, product_id, batch_no, expiry_date) DO UPDATE
                 SET quantity = warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
              [wiId, returnedWarehouseId, productId, productName, batchNo || null, r.expiry_date || null, qty]
            );
          }

          // Log the return movement in warehouse_inventory_movements
          const wimId = `WIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          await client.query(
            `INSERT INTO warehouse_inventory_movements
               (id, warehouse_id, product_name, batch_no, movement_type, quantity, reference, notes, created_by, created_at)
             VALUES ($1, $2, $3, $4, 'write_off_return', $5, $6, $7, $8, NOW())`,
            [wimId, returnedWarehouseId, productName, batchNo || '', qty,
              r.reference_id, `Returned from branch write-off. Branch: ${branchId}. Reason: ${derivedReason || 'N/A'}. ${r.notes || ''}`.trim(), gmName]
          );

          // Credit stock_batches — this is the table the warehouse portal display reads from.
          // Try to increment remaining_quantity on an existing batch first.
          const sbUpd = await client.query(
            `UPDATE stock_batches
             SET remaining_quantity = remaining_quantity + $1,
                 quantity = quantity + $1,
                 updated_at = NOW()
             WHERE location = $2
               AND LOWER(description) = LOWER($3)
               AND LOWER(COALESCE(batch_no,'')) = LOWER($4)`,
            [qty, returnedWarehouseId, productName, batchNo || '']
          );
          if (sbUpd.rowCount === 0) {
            // No existing batch — create a new stock_batches row so it appears in
            // the warehouse inventory immediately, with pricing from the write-off record.
            const sbId = `SB-WO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const cifCost = Number(r.unit_cif || 0);
            const dpcCost = Number(r.unit_dp || 0);
            await client.query(
              `INSERT INTO stock_batches
                 (id, description, batch_no, expiry_date, quantity, remaining_quantity,
                  location, status, cif_unit_cost, dpc_unit_value,
                  cif_total_value, dpc_total_value, created_at, updated_at)
               VALUES ($1,$2,$3,$4::date,$5,$5,$6,'available',$7,$8,$9,$10,NOW(),NOW())
               ON CONFLICT DO NOTHING`,
              [sbId, productName, batchNo || null, r.expiry_date || null, qty,
               returnedWarehouseId, cifCost, dpcCost,
               qty * cifCost, qty * dpcCost]
            );
          }

          disposalStatus = 'returned_to_warehouse';
        }

        await client.query(
          `UPDATE stock_movements
           SET status = 'approved', approved_by = $1,
               notes = COALESCE(notes,'') || $2,
               disposal_status = $3,
               write_off_reason = COALESCE(write_off_reason, $4),
               updated_at = NOW()
           WHERE id = $5`,
          [gmName, gmNote ? ` | GM: ${gmNote}` : '', disposalStatus, derivedReason, id]
        );
        // Return all branch-id variants + warehouseId so callers recompute everything
        return { branchId: branchId || null, effectiveBranchId: effectiveBranchId || null, warehouseId: returnedWarehouseId };
      };

      const reject = async (client, id) => {
        const { rowCount } = await client.query(
          `UPDATE stock_movements SET status = 'rejected', approved_by = $1, notes = COALESCE(notes,'') || $2, updated_at = NOW()
           WHERE id = $3 AND movement_type = 'write_off' AND status = 'pending_approval'`,
          [gmName, gmNote ? ` | GM rejected: ${gmNote}` : ' | Rejected by GM', id]
        );
        return rowCount > 0;
      };

      if (action === 'approve' || action === 'reject') {
        const id = body.id;
        if (!id) return res.status(400).json({ success: false, error: 'Missing id' });
        let result = null;
        await withTransaction(async (client) => {
          if (action === 'approve') result = await approve(client, id);
          else await reject(client, id);
        });
        // Await synchronously so inventory_balances is up-to-date before the
        // client receives the success response and re-fetches inventory.
        // Recompute for BOTH branch-id variants (e.g. 'ondangwa' AND 'ondangwa_branch')
        // because normalization failures can leave rows under either slug.
        const branchVariants = new Set([result?.branchId, result?.effectiveBranchId].filter(Boolean));
        await Promise.all([
          ...[...branchVariants].map(bid => recomputeLocationBalances('branch', bid).catch(() => {})),
          result?.warehouseId ? recomputeLocationBalances('warehouse', result.warehouseId).catch(() => {}) : null,
        ].filter(Boolean));
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
          ...[...affectedBranches].map(bid => recomputeLocationBalances('branch', bid).catch(() => {})),
          ...[...affectedWarehouses].map(wid => recomputeLocationBalances('warehouse', wid).catch(() => {})),
        ]);
        return res.json({ success: true, count: ids.length });
      }

      // Dispose action — stock manager marks written-off stock as physically disposed
      if (action === 'dispose' || action === 'dispose_all') {
        const disposedBy = body.disposed_by || req.user?.full_name || req.user?.username || 'Stock Manager';
        const ids = action === 'dispose_all'
          ? (Array.isArray(body.ids) ? body.ids : [])
          : (body.id ? [body.id] : []);
        if (ids.length === 0) return res.status(400).json({ success: false, error: 'No id(s) provided' });
        const { rowCount } = await query(
          `UPDATE stock_movements
           SET disposal_status = 'disposed',
               disposed_by = $1,
               disposed_at = NOW(),
               updated_at = NOW()
           WHERE id = ANY($2::text[])
             AND movement_type = 'write_off'
             AND disposal_status = 'pending_disposal'`,
          [disposedBy, ids]
        );
        return res.json({ success: true, disposed: rowCount });
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
