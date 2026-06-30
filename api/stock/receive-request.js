import { applyAuthCors } from '../_lib/auth.js';
import { withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function toSqlDate(value) {
  if (!value) return null;
  const str = String(value);
  const normalized = str.length === 7 ? `${str}-01` : str;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Invalid JSON payload')); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);

    const {
      requestId,
      branchId: rawBranchId,
      items = [],
      warehouseSource = 'Warehouse',
      deliveryNote = null,
      receivedBy = null,
    } = body;

    // Normalize to canonical slug (e.g. 'katima' → 'katima_mulilo', 'Katima Mulilo' → 'katima_mulilo')
    // so branch_inventory_batches and stock_movements always use the canonical branch key.
    const branchId = normalizeBranchSlug(rawBranchId) || rawBranchId;

    if (!requestId) return res.status(400).json({ success: false, error: 'requestId is required' });
    if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });
    }

    const result = await withTransaction(async (client) => {
      // ── 1. Lock the request row and check status atomically ──────────────────
      const reqResult = await client.query(
        `SELECT id, status, request_number FROM stock_requests WHERE id = $1 FOR UPDATE`,
        [requestId]
      );
      if (reqResult.rows.length === 0) {
        const err = new Error('Stock request not found');
        err.statusCode = 404;
        throw err;
      }
      const reqRow = reqResult.rows[0];
      if (reqRow.status === 'received') {
        const err = new Error(
          'This stock request has already been received. ' +
          'Duplicate receipt prevented to protect inventory accuracy.'
        );
        err.statusCode = 409;
        throw err;
      }

      const requestRef = reqRow.request_number || requestId;

      // ── 2. Process each item inside the same transaction ─────────────────────
      const processed = [];
      for (const item of items) {
        const productName = (item.productName || item.product_name || '').trim();
        const batchNo = (item.batchNo || item.batch_no || '').trim();
        const expiryDate = toSqlDate(item.expiryDate || item.expiry_date || null);
        const qty = Math.round(Number(item.quantity || item.received_qty || 0));
        const unitPrice = item.unitPrice != null ? Number(item.unitPrice) : null;

        if (!productName || !batchNo || qty <= 0) continue;

        const noteText = [
          `Received from request ${requestRef}.`,
          `Delivery note: ${deliveryNote || 'N/A'}.`,
          `Batch: ${batchNo || 'N/A'},`,
          `Expiry: ${expiryDate || 'N/A'}`,
        ].join(' ');

        // ── Deduct from source warehouse stock_batches (FEFO) ────────────────────
        // Uses the same FEFO pattern as fefoDeductStockBatches() in transfers.js.
        // Best-effort: logs a warning on shortfall but does not abort the receipt.
        if (warehouseSource) {
          const whBatches = await client.query(
            `SELECT id, remaining_quantity
             FROM stock_batches
             WHERE (LOWER(TRIM(location)) = LOWER(TRIM($1)) OR LOWER(TRIM(warehouse_id)) = LOWER(TRIM($1)))
               AND LOWER(TRIM(description)) = LOWER(TRIM($2))
               AND remaining_quantity > 0
             ORDER BY expiry_date ASC NULLS LAST, import_date ASC
             FOR UPDATE`,
            [warehouseSource, productName]
          );
          let toDeduct = qty;
          for (const row of whBatches.rows) {
            if (toDeduct <= 0) break;
            const take = Math.min(toDeduct, Number(row.remaining_quantity));
            await client.query(
              `UPDATE stock_batches
               SET remaining_quantity = remaining_quantity - $1, updated_at = NOW()
               WHERE id = $2`,
              [take, row.id]
            );
            toDeduct -= take;
          }
          if (toDeduct > 0) {
            console.warn(
              `[stock/receive-request] shortfall: could not fully deduct ` +
              `${productName} from ${warehouseSource} (shortfall: ${toDeduct}). ` +
              `Stock may have already been reserved or dispatched via a transfer.`
            );
          }
        }

        // Insert into stock_movements — 'branch_receipt' is in both INWARD_TYPES
        // (adds to branch) and OUTWARD_TYPES (subtracts from warehouse) in stockEngine,
        // so inventory_balances for both locations are correctly updated on recompute.
        const smId = generateId('MOV');
        await client.query(
          `INSERT INTO stock_movements
             (id, product_name, batch_no, expiry_date, quantity, movement_type,
              source_location, source_location_type,
              destination_location, destination_location_type,
              reference_id, notes, created_by, status,
              movement_date, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'branch_receipt',$6,'warehouse',$7,'branch',$8,$9,$10,'posted',NOW(),NOW(),NOW())`,
          [smId, productName, batchNo, expiryDate, qty,
           warehouseSource, branchId, requestId, noteText, receivedBy]
        );

        // Upsert into branch_inventory_batches (add qty, preserve existing price)
        const bibId = generateId('BATCH');
        await client.query(
          `INSERT INTO branch_inventory_batches
             (id, branch_id, product_name, batch_no, expiry_date,
              quantity, unit_price, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'in_stock',NOW(),NOW())
           ON CONFLICT (branch_id, product_name, batch_no, expiry_date)
           DO UPDATE SET
             quantity   = branch_inventory_batches.quantity + EXCLUDED.quantity,
             unit_price = COALESCE(EXCLUDED.unit_price, branch_inventory_batches.unit_price),
             status     = 'in_stock',
             updated_at = NOW()`,
          [bibId, branchId, productName, batchNo, expiryDate, qty, unitPrice]
        );

        // Insert into branch_inventory_movements
        const bimId = generateId('BIM');
        await client.query(
          `INSERT INTO branch_inventory_movements
             (id, branch_id, type, product_name, batch_no, quantity,
              source_branch_id, reference, notes, created_by, created_at)
           VALUES ($1,$2,'receive',$3,$4,$5,$6,$7,$8,$9,NOW())`,
          [bimId, branchId, productName, batchNo, qty,
           warehouseSource, requestId, noteText, receivedBy]
        );

        processed.push({ productName, batchNo, qty });
      }

      if (processed.length === 0) {
        const err = new Error('No valid items to receive (check quantities, batch numbers and product names)');
        err.statusCode = 422;
        throw err;
      }

      // ── 3. Flip request status to received — same transaction ─────────────────
      await client.query(
        `UPDATE stock_requests SET status = 'received', updated_at = NOW() WHERE id = $1`,
        [requestId]
      );

      return { requestRef, itemsProcessed: processed.length, processed };
    });

    // ── Post-transaction: recompute balances for both branch and warehouse ───────
    recomputeLocationBalances('branch', branchId).catch((e) =>
      console.error('[stock/receive-request] branch recompute error:', e.message)
    );
    if (warehouseSource) {
      recomputeLocationBalances('warehouse', warehouseSource).catch((e) =>
        console.error('[stock/receive-request] warehouse recompute error:', e.message)
      );
    }

    return res.json({
      success: true,
      requestRef: result.requestRef,
      branchId,
      itemsProcessed: result.itemsProcessed,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[stock/receive-request]', err.message);
    return res.status(status).json({ success: false, error: err.message });
  }
}
