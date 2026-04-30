import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { query, getMany, getOne, withTransaction } from './db.js';
import { recomputeLocationBalances, recomputeInventoryBalance, inferLocationType } from './services/stockEngine.js';

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

      if (['write_off', 'sale', 'return', 'field_use', 'received'].includes(movType)) {
        const id = `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const referenceId = body.reference_id || body.referenceId || null;
        const batchNo = body.batch_no || body.batchNo || null;
        const expiryDate = body.expiry_date || body.expiryDate || null;
        const srcLoc = body.source_location || body.sourceLocation || null;
        const destLoc = body.destination_location || body.destinationLocation || null;
        const srcLocType = inferLocationType(srcLoc);
        const dstLocType = inferLocationType(destLoc);
        const branchId = srcLoc || destLoc;
        // Allow branch users to submit write-offs pending GM approval
        const movStatus = body.status === 'pending_approval' ? 'pending_approval' : 'posted';

        if (branchScope.enforced) {
          // For outbound movements (write_off, sale, field_use, return): check source branch
          // For inbound movements (received): check destination branch
          const primaryBranchLoc = movType === 'received' ? (destLoc || srcLoc) : (srcLoc || destLoc);
          if (!primaryBranchLoc || !branchScope.branches.includes(primaryBranchLoc)) {
            return res.status(403).json({ success: false, error: 'Access denied: cannot post movement for this branch' });
          }
        }
        // For pending write-offs: insert record only (no stock deduction — GM must approve first)
        const needsBranchMirror = branchId && ['write_off', 'sale', 'field_use', 'return'].includes(movType) && movStatus !== 'pending_approval';
        // Extract write-off reason from explicit field or first segment of notes
        const rawReason = body.reason || body.write_off_reason || null;
        const woReason = rawReason || (movType === 'write_off' && notes ? notes.split(' — ')[0].split('|')[0].trim() : null);
        // Write-offs go into a disposal queue immediately (unless pending GM approval)
        const disposalStatus = movType === 'write_off' && movStatus === 'posted' ? 'pending_disposal' : null;

        await withTransaction(async (client) => {
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
              let remaining = qty;
              // If a specific batch_no is given, deduct from it first before falling back to FIFO
              if (batchNo) {
                const specificBatch = await client.query(
                  `SELECT id, quantity FROM branch_inventory_batches
                   WHERE LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($1, ' ', '_'))
                     AND LOWER(product_name) = LOWER($2)
                     AND LOWER(COALESCE(batch_no,'')) = LOWER($3)
                     AND quantity > 0
                   LIMIT 1`,
                  [branchId, productName, batchNo]
                );
                for (const b of specificBatch.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
                  remaining -= take;
                }
              }
              if (remaining > 0) {
                const batches = await client.query(
                  `SELECT id, quantity FROM branch_inventory_batches
                   WHERE LOWER(REPLACE(branch_id, ' ', '_')) = LOWER(REPLACE($1, ' ', '_'))
                     AND LOWER(product_name) = LOWER($2)
                     AND quantity > 0
                     ${batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : ''}
                   ORDER BY expiry_date ASC NULLS LAST`,
                  batchNo ? [branchId, productName, batchNo] : [branchId, productName]
                );
                for (const b of batches.rows) {
                  if (remaining <= 0) break;
                  const take = Math.min(remaining, Number(b.quantity));
                  await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
                  remaining -= take;
                }
              }
            }
          }
        });
        // Recompute inventory_balances for affected locations
        const locType = srcLocType || dstLocType;
        const locId = srcLoc || destLoc;
        if (locType && locId) {
          recomputeLocationBalances(locType, locId).catch(e =>
            console.error('[stockEngine] stock-movements recompute error:', e.message)
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
        if (rows.length === 0) return false;
        const r = rows[0];
        const branchId = r.source_location;
        const productName = r.product_name;
        const batchNo = r.batch_no;
        const qty = Number(r.quantity || 0);
        // Deduct from branch_inventory_batches
        if (branchId && productName && qty > 0) {
          let remaining = qty;
          if (batchNo) {
            const specific = await client.query(
              `SELECT id, quantity FROM branch_inventory_batches
               WHERE LOWER(REPLACE(branch_id,' ','_')) = LOWER(REPLACE($1,' ','_'))
                 AND LOWER(product_name) = LOWER($2)
                 AND LOWER(COALESCE(batch_no,'')) = LOWER($3)
                 AND quantity > 0 LIMIT 1`,
              [branchId, productName, batchNo]
            );
            for (const b of specific.rows) {
              const take = Math.min(remaining, Number(b.quantity));
              await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
              remaining -= take;
            }
          }
          if (remaining > 0) {
            const fifo = await client.query(
              `SELECT id, quantity FROM branch_inventory_batches
               WHERE LOWER(REPLACE(branch_id,' ','_')) = LOWER(REPLACE($1,' ','_'))
                 AND LOWER(product_name) = LOWER($2)
                 AND quantity > 0
                 ${batchNo ? `AND LOWER(COALESCE(batch_no,'')) != LOWER($3)` : ''}
               ORDER BY expiry_date ASC NULLS LAST`,
              batchNo ? [branchId, productName, batchNo] : [branchId, productName]
            );
            for (const b of fifo.rows) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(b.quantity));
              await client.query(`UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [take, b.id]);
              remaining -= take;
            }
          }
          // Mirror to branch_inventory_movements
          const bimId = `BIM-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          await client.query(
            `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, reference, notes, created_by, created_at)
             VALUES ($1,$2,'write_off',$3,$4,$5,$6,$7,$8,NOW())`,
            [bimId, branchId, productName, batchNo || '', qty, r.reference_id, r.notes, gmName]
          );
        }
        // Extract reason from notes if not already stored
        const existingReason = r.write_off_reason;
        const derivedReason = existingReason || (r.notes ? r.notes.split(' — ')[0].split('|')[0].trim() : null);
        await client.query(
          `UPDATE stock_movements
           SET status = 'approved', approved_by = $1,
               notes = COALESCE(notes,'') || $2,
               disposal_status = 'pending_disposal',
               write_off_reason = COALESCE(write_off_reason, $3),
               updated_at = NOW()
           WHERE id = $4`,
          [gmName, gmNote ? ` | GM: ${gmNote}` : '', derivedReason, id]
        );
        return true;
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
        await withTransaction(async (client) => {
          if (action === 'approve') await approve(client, id);
          else await reject(client, id);
        });
        recomputeLocationBalances('branch', body.source_location || '').catch(() => {});
        return res.json({ success: true });
      }

      if (action === 'approve_all' || action === 'reject_all') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return res.status(400).json({ success: false, error: 'No ids provided' });
        await withTransaction(async (client) => {
          for (const id of ids) {
            if (action === 'approve_all') await approve(client, id);
            else await reject(client, id);
          }
        });
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
    return res.status(500).json({ error: 'Internal server error' });
  }
}
