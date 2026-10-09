import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { getBranchScope } from '../_lib/auth.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';
import { lockStockBatchTx } from './stockLocks.js';
import { saleAllocationSchema, refundSourceSnapshotTx, preserveRestoredProvenanceTx } from './stockSaleAllocations.js';
import { postStockMovementTx, recomputeInventoryBalanceTx } from './stockEngine.js';

// Additive schema only: never derive or rewrite historical physical stock.
export async function ensureControlledStockSchema() {
  await query(saleAllocationSchema);
  await query(`CREATE TABLE IF NOT EXISTS stock_control_operations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
    reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lines JSONB NOT NULL,
    review_history JSONB NOT NULL DEFAULT '[]', dispatch_history JSONB NOT NULL DEFAULT '[]')`);
  await query(`CREATE TABLE IF NOT EXISTS stock_segregated_batches (
    id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
    location TEXT NOT NULL, condition TEXT NOT NULL, quantity NUMERIC NOT NULL CHECK(quantity >= 0),
    snapshot JSONB NOT NULL, operation_id TEXT NOT NULL, line_id TEXT NOT NULL,
    purpose TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS supplier_return_credits (
    operation_id TEXT NOT NULL REFERENCES stock_control_operations(id),
    supplier_import_id TEXT NOT NULL, supplier_name TEXT NOT NULL,
    expected_amount NUMERIC NOT NULL DEFAULT 0, credited_amount NUMERIC,
    credit_reference TEXT, status TEXT NOT NULL DEFAULT 'awaiting_credit',
    recorded_by TEXT, recorded_at TIMESTAMPTZ,
    PRIMARY KEY(operation_id,supplier_import_id))`);
  await query(`CREATE TABLE IF NOT EXISTS stock_control_financial_entries (
    id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES stock_control_operations(id),
    line_id TEXT, supplier_import_id TEXT, event TEXT NOT NULL,
    debit_account TEXT NOT NULL, credit_account TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK(amount >= 0), reference TEXT, created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

export function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}
const gmRoles = ['gm', 'admin', 'superadmin', 'super_admin'];
const stockRoles = [...gmRoles, 'stock', 'stock_manager', 'warehouse', 'warehouse_manager', 'branch', 'branch_manager', 'dispenser', 'frontdesk'];
export function roleOf(user) { return String(user?.role || '').toLowerCase(); }
export function isGM(user) { return gmRoles.includes(roleOf(user)); }
export function actor(user) { return user?.sub || user?.id || user?.username || fail('Authenticated identity required', 401); }
function canOperate(user) {
  if (!stockRoles.includes(roleOf(user))) fail('Stock staff access required', 403);
}
function scoped(user, location, type) {
  const scope = getBranchScope(user);
  if (scope.enforced && (type !== 'branch' || !scope.branches.some(b => normalizeBranchSlug(b) === normalizeBranchSlug(location))))
    fail('Access denied for this stock location', 403);
  if (['branch', 'branch_manager'].includes(roleOf(user)) && !scope.enforced)
    fail('A branch assignment is required', 403);
}
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10) || null;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const expired = batch => batch.expiry_date && batch.expiry_date < today();
function integer(value, zero = false) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') fail('A whole base-unit quantity is required');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (zero ? 0 : 1)) fail('Quantity must be a nonnegative whole base-unit quantity');
  return n;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required`);
  return value.trim();
}
function list(value) {
  if (!Array.isArray(value) || !value.length || value.length > 200) fail('Provide between 1 and 200 lines');
  return value;
}
function unique(lines, key) {
  if (new Set(lines.map(key)).size !== lines.length) fail('Duplicate lines are not allowed');
}
export function countDifference(counted, expected, current) {
  const delta = integer(counted, true) - Number(expected);
  const result = Number(current) + delta;
  if (!Number.isSafeInteger(result) || result < 0) fail('Count difference exceeds current stock; recount is required', 409);
  return { delta, result };
}

async function loadBatch(client, type, id, user, lock = true) {
  const tables = { branch: 'branch_inventory_batches', warehouse: 'stock_batches', segregated: 'stock_segregated_batches' };
  if (!tables[type]) fail('Unknown batch type');
  const row = (await client.query(`SELECT * FROM ${tables[type]} WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
  if (!row) fail('Batch not found', 404);
  if (type === 'segregated') {
    scoped(user, row.location, row.source_type);
    return { ...row.snapshot, id: row.id, batch_type: type, source_type: row.source_type, source_id: row.source_id,
      location: row.location, quantity: Number(row.quantity), condition: row.condition, purpose: row.purpose };
  }
  const location = type === 'branch' ? row.branch_id : row.warehouse_id || row.location;
  scoped(user, location, type);
  if (type === 'warehouse' && !String(location || '').includes('warehouse')) fail('Only branch and warehouse batches are supported');
  let source = type === 'warehouse' ? row : null;
  if (type === 'branch' && row.source_batch_id)
    source = (await client.query('SELECT * FROM stock_batches WHERE id=$1', [row.source_batch_id])).rows[0];
  if (source && type === 'branch' && (source.batch_no !== row.batch_no || date(source.expiry_date) !== date(row.expiry_date)
    || String(source.description || '').trim().toLowerCase() !== String(row.product_name || '').trim().toLowerCase())) {
    // A similar product/lot is not sufficient evidence of this original layer.
    source = null;
  }
  const meta = row.metadata || {};
  const frozen = meta.original_source;
  if (type === 'branch' && frozen && frozen.id === row.source_batch_id
    && frozen.batch_no === row.batch_no && date(frozen.expiry_date) === date(row.expiry_date)
    && String(frozen.description || '').trim().toLowerCase() === String(row.product_name || '').trim().toLowerCase())
    source = frozen;
  const unresolved = meta.provenance_conflict || (type === 'branch' && row.source_batch_id && !source);
  if (unresolved) source = null;
  const cost = unresolved ? null : source?.cif_unit_cost ?? meta.cif_unit_cost ?? meta.unit_cif;
  const batch = { id: row.id, batch_type: type, location, product_name: row.product_name || row.description,
    product_id: row.product_id || row.product_code, batch_no: row.batch_no, expiry_date: date(row.expiry_date),
    quantity: Number(type === 'branch' ? row.quantity : row.remaining_quantity),
    source_batch_id: type === 'branch' ? row.source_batch_id : row.id,
    supplier_import_id: unresolved ? null : source?.supplier_import_id || meta.supplier_import_id || null,
    supplier_name: unresolved ? null : source?.supplier_name || meta.supplier_name || null,
    unit_cost: cost === null || cost === undefined ? null : Number(cost),
    unit_dp: source?.dpc_unit_value ?? row.unit_price, status: row.status,
    condition: meta.return_condition || meta.condition || (['damaged','expired','quarantine'].includes(row.status) ? row.status : 'saleable') };
  batch.available_quantity = !expired(batch) && batch.condition === 'saleable'
    && ['in_stock','available','active',null,undefined].includes(batch.status) ? batch.quantity : 0;
  return batch;
}
async function provenance(client, batch) {
  if (!batch.supplier_import_id || batch.unit_cost === null || !Number.isFinite(batch.unit_cost) || batch.unit_cost < 0)
    fail('Original supplier import and batch cost evidence is required; no catalogue price fallback is allowed');
  const source = (await client.query('SELECT * FROM supplier_imports WHERE id=$1', [batch.supplier_import_id])).rows[0];
  if (!source || !source.supplier_name) fail('Original supplier import was not found');
  batch.supplier_name = source.supplier_name;
  batch.invoice_number = source.invoice_number;
  batch.import_reference = source.import_reference;
}
function stableIdentity(a, b) {
  for (const key of ['location','product_name','batch_no','expiry_date','source_batch_id','supplier_import_id','unit_cost'])
    if ((a[key] ?? null) !== (b[key] ?? null)) fail('Batch identity or cost changed since submission; resubmit or recount', 409);
}
async function inspectionReleaseTargetTx(client, batch, user) {
  if (batch.purpose !== 'customer_return')
    return loadBatch(client,batch.source_type,batch.source_id,user);
  // A new accepted customer return is already physical segregation. Only GM's
  // approved inspection may create its empty available destination, never startup
  // reconciliation or refund submission. Missing supplier/cost evidence stays null.
  const branch = normalizeBranchSlug(batch.location) || batch.location;
  await lockStockBatchTx(client,branch,batch.product_name,batch.batch_no,batch.expiry_date);
  const aliases = [...new Set([branch,...branchSearchTerms(branch)].map(value=>String(value).toLowerCase().trim()))];
  const rows = (await client.query(`SELECT id FROM branch_inventory_batches
    WHERE LOWER(TRIM(branch_id))=ANY($1::text[]) AND LOWER(TRIM(product_name))=LOWER(TRIM($2))
      AND COALESCE(batch_no,'')=COALESCE($3,'') AND expiry_date IS NOT DISTINCT FROM $4::date FOR UPDATE`,
    [aliases,batch.product_name,batch.batch_no,batch.expiry_date])).rows;
  if (rows.length>1) fail('Ambiguous refund destination batches require separate review',409);
  const id = rows[0]?.id || `BIB-${randomUUID()}`;
  if (!rows.length) await client.query(`INSERT INTO branch_inventory_batches
    (id,branch_id,product_name,batch_no,expiry_date,quantity,source_batch_id,unit_price,metadata,status,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,'in_stock',NOW(),NOW())`,
    [id,branch,batch.product_name,batch.batch_no,batch.expiry_date,batch.source_batch_id || null,
      batch.unit_dp ?? null,JSON.stringify({unit_cif:batch.unit_cost,supplier_import_id:batch.supplier_import_id,
        original_source:batch.original_source || null,customer_return_reference:batch.refund_reference})]);
  await preserveRestoredProvenanceTx(client,{batchId:id,snapshot:batch});
  const target = await loadBatch(client,'branch',id,user);
  // A sale can consume layer A, and the same physical row can later hold layer B.
  // GM may make inspected goods available, but this must not attribute A to B.
  await client.query('UPDATE stock_segregated_batches SET source_id=$1,updated_at=NOW() WHERE id=$2',[id,batch.id]);
  return target;
}
async function movement(client, batch, delta, operation, user, destination = null, type = null) {
  if (!delta) return;
  const locationType = batch.batch_type === 'segregated' ? 'quarantine' : batch.batch_type;
  const location = batch.batch_type === 'segregated' ? `quarantine:${batch.location}` : batch.location;
  const result = await postStockMovementTx(client, {
    productName: batch.product_name, productId: batch.product_id, batchNo: batch.batch_no,
    expiryDate: batch.expiry_date, quantity: Math.abs(delta),
    movementType: type || (delta > 0 ? 'positive_adjustment' : 'negative_adjustment'),
    sourceLocation: delta < 0 ? location : null, sourceLocationType: delta < 0 ? locationType : null,
    destinationLocation: destination || (delta > 0 ? location : null),
    destinationLocationType: destination ? 'quarantine' : delta > 0 ? locationType : null,
    unitCIF: batch.unit_cost, unitDP: batch.unit_dp,
    referenceType: operation.kind, referenceId: operation.id, createdBy: actor(user), notes: operation.reason,
  });
  for (const target of result.recomputeTargets) await recomputeInventoryBalanceTx(client, target);
  if (batch.batch_type === 'branch') await client.query(
    `INSERT INTO branch_inventory_movements
      (id,branch_id,type,product_name,batch_no,quantity,related_batch_id,reference,notes,created_by,metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(),batch.location,operation.kind === 'count' ? 'adjustment' : delta > 0 ? 'return_in' : 'return_out',
      batch.product_name,batch.batch_no, operation.kind === 'count' ? delta : Math.abs(delta),
      batch.id,operation.id,operation.reason,actor(user), JSON.stringify({expiry_date:batch.expiry_date,delta})]);
}
async function changePhysical(client, batch, delta, countAdjustment = false) {
  const next = batch.quantity + delta;
  if (next < 0 || !Number.isSafeInteger(next)) fail('Insufficient locked current stock', 409);
  if (batch.batch_type === 'branch') {
    await client.query(`UPDATE branch_inventory_batches SET quantity=$1::numeric,
      quantity_adjusted=COALESCE(quantity_adjusted,0)+$2,
      status=CASE WHEN status='out_of_stock' AND $1::numeric>0 THEN 'in_stock' ELSE status END,
      updated_at=NOW() WHERE id=$3`, [next,countAdjustment ? delta : 0,batch.id]);
  } else if (batch.batch_type === 'warehouse') {
    // Count differences correct the physical baseline. Segregation instead moves
    // stock to another location, preserving received quantity and original cost.
    if (countAdjustment) {
      await client.query(`UPDATE stock_batches SET remaining_quantity=$1,
        quantity=GREATEST(COALESCE(quantity,0)+$2,$1),
        status=CASE WHEN status='out_of_stock' AND $1::numeric>0 THEN 'available' ELSE status END,
        updated_at=NOW() WHERE id=$3`, [next,delta,batch.id]);
    } else {
      await client.query(`UPDATE stock_batches SET remaining_quantity=$1,
        dispatched_quantity=GREATEST(0,COALESCE(dispatched_quantity,0)-$2),
        status=CASE WHEN status='out_of_stock' AND $1::numeric>0 THEN 'available' ELSE status END,
        updated_at=NOW() WHERE id=$3`, [next,delta,batch.id]);
    }
  } else await client.query('UPDATE stock_segregated_batches SET quantity=$1,updated_at=NOW() WHERE id=$2', [next,batch.id]);
}
async function segregate(client, batch, quantity, condition, op, line, purpose) {
  const id = randomUUID();
  await client.query(`INSERT INTO stock_segregated_batches
    (id,source_type,source_id,location,condition,quantity,snapshot,operation_id,line_id,purpose)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id,batch.source_type || batch.batch_type,batch.source_id || batch.id,batch.location,condition,
      quantity,JSON.stringify(batch),op.id,line.id,purpose]);
  return id;
}
async function financial(client, op, line, event, debit, credit, amount, user, reference = null) {
  if (!Number.isFinite(amount) || amount < 0) fail('Original cost evidence is required for financial posting');
  amount = Math.round((amount + Number.EPSILON)*100)/100;
  await client.query(`INSERT INTO stock_control_financial_entries
    (id,operation_id,line_id,supplier_import_id,event,debit_account,credit_account,amount,reference,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(),op.id,line?.id || null,line?.snapshot?.supplier_import_id || null,event,debit,credit,
      amount,reference,actor(user)]);
}
async function save(client, op) {
  return (await client.query(`UPDATE stock_control_operations SET status=$2,lines=$3,
    review_history=$4,dispatch_history=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [op.id,op.status,JSON.stringify(op.lines),JSON.stringify(op.review_history),JSON.stringify(op.dispatch_history)])).rows[0];
}
function statusAfterReview(op) {
  if (op.lines.some(l => l.status === 'pending')) return op.lines.some(l => l.status !== 'pending') ? 'partially_reviewed' : 'submitted';
  if (op.kind === 'supplier_return' && op.lines.some(l => l.dispatched_quantity > 0)) {
    return op.lines.filter(l => l.status === 'approved').every(l => l.dispatched_quantity === l.approved_quantity)
      ? 'dispatched' : 'partially_dispatched';
  }
  return op.lines.some(l => l.status === 'approved') ? 'approved' : 'rejected';
}

export async function createOperation(user, body) {
  canOperate(user);
  const kind = body.kind;
  if (!['count','supplier_return','inspection'].includes(kind)) fail('Unknown operation kind');
  const requested = list(body.lines);
  unique(requested, l => `${l.batch_type}:${l.batch_id}`);
  const reason = text(body.reason, 'Reason');
  return withTransaction(async client => {
    const lines = [];
    // Deterministic row-lock ordering avoids cross-session deadlocks.
    for (const input of [...requested].sort((a,b) => `${a.batch_type}:${a.batch_id}`.localeCompare(`${b.batch_type}:${b.batch_id}`))) {
      const snapshot = await loadBatch(client,input.batch_type,input.batch_id,user);
      if (kind === 'count' && snapshot.batch_type === 'segregated') fail('Count sessions require branch or warehouse batches');
      if (kind === 'count') {
        const overlapping = await client.query(`SELECT id FROM stock_control_operations
          WHERE kind='count' AND status IN ('draft','submitted','partially_reviewed')
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(lines) l WHERE l->>'batch_type'=$1
              AND l->>'batch_id'=$2 AND l->>'status'='pending') LIMIT 1`,[input.batch_type,input.batch_id]);
        if (overlapping.rows.length) fail('This batch already has an open count; review or cancel it before starting another',409);
      }
      const line = { id: randomUUID(),batch_type:input.batch_type,batch_id:input.batch_id,snapshot,
        expected_quantity:snapshot.quantity,status:'pending',reason:input.reason || reason };
      if (kind !== 'count') {
        line.quantity = integer(input.quantity);
        if (line.quantity > snapshot.quantity) fail('Requested quantity exceeds current stock');
        if (!['saleable','damaged','expired','quarantine'].includes(input.condition)) fail('Condition classification is required');
        line.condition = input.condition;
        if (expired(snapshot) && line.condition !== 'expired') fail('Expired batches must be classified expired');
        if (kind === 'supplier_return') {
          await provenance(client,snapshot);
          if (snapshot.purpose === 'supplier_return') fail('Stock already reserved for another supplier return');
          if (['damaged','expired'].includes(snapshot.condition) && line.condition !== snapshot.condition)
            fail('Damaged or expired condition cannot be changed by a supplier return');
        } else {
          line.disposition = input.disposition;
          if (!['quarantine','release','write_off'].includes(line.disposition)) fail('Inspection disposition is required');
          if (snapshot.batch_type !== 'segregated' && line.disposition !== 'quarantine') fail('Segregate stock before disposition');
          if (snapshot.purpose === 'supplier_return') fail('Supplier-return holds cannot be released or written off');
          if (line.disposition === 'release' && (line.condition !== 'saleable' || ['damaged','expired'].includes(snapshot.condition) || expired(snapshot)))
            fail('Only inspected saleable, unexpired stock may be released');
          if (line.disposition === 'write_off' && snapshot.unit_cost === null) fail('Original batch cost required for write-off');
        }
      }
      lines.push(line);
    }
    return (await client.query(`INSERT INTO stock_control_operations (id,kind,status,reason,created_by,lines)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(),kind,kind === 'count' ? 'draft' : 'submitted',reason,actor(user),JSON.stringify(lines)])).rows[0];
  });
}

export async function updateOperation(user, body) {
  const action = body.action;
  if (action === 'review' && !isGM(user)) fail('GM approval is required', 403);
  if (action === 'credit') {
    if (!isGM(user) && roleOf(user) !== 'finance') fail('Finance or GM access required', 403);
  } else canOperate(user);
  return withTransaction(async client => {
    const op = (await client.query('SELECT * FROM stock_control_operations WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
    if (!op) fail('Operation not found',404);
    for (const l of op.lines) scoped(user,l.snapshot.location,l.snapshot.source_type || l.snapshot.batch_type);
    if (action === 'submit' || action === 'cancel') {
      if (op.status !== 'draft') fail('Only draft counts can be submitted or cancelled',409);
      if (actor(user) !== op.created_by && !isGM(user)) fail('Only the creator can submit this count',403);
      if (action === 'cancel') op.status = 'cancelled';
      else {
        const inputs = list(body.lines); unique(inputs,l => l.id);
        if (inputs.length !== op.lines.length) fail('Every count line must be completed');
        for (const l of op.lines) {
          const input = inputs.find(i => i.id === l.id);
          if (!input) fail('Unknown count line');
          l.counted_quantity = integer(input.counted_quantity,true);
          l.reason = text(input.reason,'Line count reason');
          l.submitted_at = new Date().toISOString();
        }
        op.status = 'submitted';
        op.submitted_at = new Date().toISOString();
      }
    } else if (action === 'review') {
      if (!['submitted','partially_reviewed'].includes(op.status)) fail('Operation is not pending review',409);
      const decisions = list(body.decisions); unique(decisions,d => d.line_id);
      const reviewed = [];
      for (const decision of [...decisions].sort((a,b) => {
        const x=op.lines.find(l=>l.id===a.line_id),y=op.lines.find(l=>l.id===b.line_id);
        return `${x?.batch_type}:${x?.batch_id}`.localeCompare(`${y?.batch_type}:${y?.batch_id}`);
      })) {
        const line = op.lines.find(l => l.id === decision.line_id);
        if (!line || line.status !== 'pending') fail('Line is not pending review',409);
        if (!['approve','reject'].includes(decision.decision)) fail('Decision must be approve or reject');
        if (decision.decision === 'reject') { line.status = 'rejected'; reviewed.push(line.id); continue; }
        const batch = await loadBatch(client,line.batch_type,line.batch_id,user);
        stableIdentity(batch,line.snapshot);
        line.current_at_approval = batch.quantity;
        if (op.kind === 'count') {
          const {delta} = countDifference(line.counted_quantity,line.expected_quantity,batch.quantity);
          await changePhysical(client,batch,delta,true);
          await movement(client,batch,delta,op,user);
          line.applied_delta = delta;
          if (delta && batch.unit_cost !== null) await financial(client,op,line,'count_difference',
            delta > 0 ? 'inventory' : 'stock_loss',delta > 0 ? 'stock_surplus' : 'inventory',
            Math.abs(delta)*batch.unit_cost,user);
          else if (delta) line.financial_cost_missing = true;
        } else {
          const qty = integer(decision.quantity ?? line.quantity);
          if (qty > line.quantity) fail('Approved quantity exceeds requested quantity');
          if (expired(batch) && line.condition !== 'expired') fail('Batch expired since submission; resubmit as expired',409);
          await changePhysical(client,batch,-qty);
          line.approved_quantity = qty;
          line.rejected_quantity = line.quantity-qty;
          if (op.kind === 'supplier_return' || line.disposition === 'quarantine') {
            if (op.kind === 'supplier_return') await provenance(client,batch);
            line.hold_id = await segregate(client,batch,qty,line.condition,op,line,op.kind === 'supplier_return' ? 'supplier_return' : 'inspection');
            await movement(client,batch,-qty,op,user,`quarantine:${batch.location}`,'transit_dispatch');
            if (batch.batch_type !== 'segregated' && batch.unit_cost !== null) await financial(client,op,line,
              'segregation','segregated_inventory','inventory',qty*batch.unit_cost,user);
          } else if (line.disposition === 'release') {
            if (line.condition !== 'saleable' || ['damaged','expired'].includes(batch.condition) || expired(batch)) fail('Stock is not saleable',409);
            const original = await inspectionReleaseTargetTx(client,batch,user);
            // Compare original identity to the saved source rather than the segregated row id.
            if (batch.purpose !== 'customer_return') stableIdentity(original,line.snapshot);
            if (!['in_stock','available','active','out_of_stock',null,undefined].includes(original.status)) fail('Original batch is not available for release',409);
            await changePhysical(client,original,qty);
            await movement(client,batch,-qty,op,user);
            await movement(client,original,qty,op,user);
            if (batch.unit_cost !== null) await financial(client,op,line,'inspection_release','inventory','segregated_inventory',qty*batch.unit_cost,user);
          } else {
            await movement(client,batch,-qty,op,user,null,'write_off');
            await financial(client,op,line,'write_off','stock_loss','segregated_inventory',qty*batch.unit_cost,user);
          }
        }
        line.status = 'approved'; line.approved_by = actor(user); line.approved_at = new Date().toISOString();
        reviewed.push(line.id);
      }
      op.review_history.push({by:actor(user),at:new Date().toISOString(),notes:body.notes || '',decisions,lines:reviewed});
      op.status = statusAfterReview(op);
    } else if (action === 'dispatch') {
      if (op.kind !== 'supplier_return' || !['approved','partially_reviewed','partially_dispatched'].includes(op.status))
        fail('No approved supplier return is ready for dispatch',409);
      const inputs = list(body.lines); unique(inputs,l => l.line_id);
      const reference = text(body.reference,'Dispatch reference');
      for (const input of inputs) {
        const line = op.lines.find(l => l.id === input.line_id && l.status === 'approved');
        if (!line) fail('Approved line not found');
        const qty = integer(input.quantity);
        if (qty > line.approved_quantity-(line.dispatched_quantity || 0)) fail('Dispatch exceeds approved remaining quantity',409);
        const hold = await loadBatch(client,'segregated',line.hold_id,user);
        await changePhysical(client,hold,-qty);
        await movement(client,hold,-qty,op,user,null,'return_out');
        const amount = Math.round(qty*line.snapshot.unit_cost*100)/100;
        await financial(client,op,line,'supplier_return_dispatch','supplier_return_receivable','segregated_inventory',amount,user,reference);
        await client.query(`INSERT INTO supplier_return_credits (operation_id,supplier_import_id,supplier_name,expected_amount)
          VALUES ($1,$2,$3,$4) ON CONFLICT(operation_id,supplier_import_id)
          DO UPDATE SET expected_amount=supplier_return_credits.expected_amount+EXCLUDED.expected_amount`,
          [op.id,line.snapshot.supplier_import_id,line.snapshot.supplier_name,amount]);
        line.dispatched_quantity = (line.dispatched_quantity || 0)+qty;
      }
      op.dispatch_history.push({by:actor(user),at:new Date().toISOString(),reference,lines:inputs});
      op.status = op.lines.some(l => l.status === 'pending') ? 'partially_reviewed'
        : op.lines.filter(l=>l.status==='approved').every(l=>l.dispatched_quantity===l.approved_quantity) ? 'dispatched' : 'partially_dispatched';
    } else if (action === 'credit') {
      if (op.kind !== 'supplier_return' || op.status !== 'dispatched') fail('Fully dispatch the return before recording supplier credit',409);
      const reference = text(body.credit_reference,'Supplier credit reference');
      const amount = Number(body.credited_amount);
      if (body.credited_amount === '' || body.credited_amount == null || !Number.isFinite(amount) || amount < 0 || Math.abs(Math.round(amount*100)-amount*100)>0.00001)
        fail('Credit amount must be a nonnegative currency amount with at most two decimals');
      const credits = (await client.query('SELECT * FROM supplier_return_credits WHERE operation_id=$1 FOR UPDATE',[op.id])).rows;
      // A supplier credit note belongs to one original import. Multi-import sessions record each note separately.
      const credit = credits.find(c => c.supplier_import_id === body.supplier_import_id) || (credits.length === 1 ? credits[0] : null);
      if (!credit) fail('Select the original supplier import for this credit');
      if (credit.status === 'credited') fail('Supplier credit already recorded',409);
      await financial(client,op,{snapshot:credit},'supplier_credit','supplier_payable','supplier_return_receivable',Math.min(amount,Number(credit.expected_amount)),user,reference);
      const variance = amount-Number(credit.expected_amount);
      if (variance) await financial(client,op,{snapshot:credit},'supplier_credit_variance',variance>0?'supplier_payable':'return_loss',
        variance>0?'return_gain':'supplier_return_receivable',Math.abs(variance),user,reference);
      await client.query(`UPDATE supplier_return_credits SET credited_amount=$3,credit_reference=$4,
        recorded_by=$5,recorded_at=NOW(),status='credited' WHERE operation_id=$1 AND supplier_import_id=$2`,
        [op.id,credit.supplier_import_id,amount,reference,actor(user)]);
      if (credits.every(c => c === credit || c.status === 'credited')) op.status = 'credited';
    } else fail('Unknown action');
    return save(client,op);
  });
}

export async function listOperations(user) {
  if (![...stockRoles,'finance','director','mis'].includes(roleOf(user))) fail('Access denied',403);
  const permitted = batch => { try { scoped(user,batch.location,batch.source_type || batch.batch_type); return true; } catch { return false; } };
  return withTransaction(async client => {
    const batches = [];
    const branchRows = (await client.query('SELECT id FROM branch_inventory_batches')).rows;
    const warehouseRows = (await client.query("SELECT id FROM stock_batches WHERE COALESCE(warehouse_id,location,'') LIKE '%warehouse%'")).rows;
    for (const [type,rows] of [['branch',branchRows],['warehouse',warehouseRows]]) {
      for (const row of rows) {
        try { batches.push(await loadBatch(client,type,row.id,user,false)); }
        catch (error) { if (error.statusCode !== 403) throw error; }
      }
    }
    const segregated = (await client.query('SELECT * FROM stock_segregated_batches WHERE quantity>0 ORDER BY created_at DESC')).rows
      .map(r=>({...r.snapshot,...r,id:r.id,batch_type:'segregated',quantity:Number(r.quantity)})).filter(permitted);
    const operations = (await client.query('SELECT * FROM stock_control_operations ORDER BY created_at DESC')).rows
      .filter(op=>op.lines.every(l=>permitted(l.snapshot)));
    const ids = operations.map(o=>o.id);
    const credits = (await client.query('SELECT * FROM supplier_return_credits WHERE operation_id=ANY($1::text[])',[ids])).rows;
    const financial_entries = (await client.query('SELECT * FROM stock_control_financial_entries WHERE operation_id=ANY($1::text[]) ORDER BY created_at',[ids])).rows;
    return {operations,batches,segregated,credits,financial_entries,locations:[...new Set(batches.map(b=>b.location))]};
  });
}

// Only called during a newly approved refund. Existing quarantine evidence is
// not converted into physical stock without separately reviewed provenance.
export async function registerRefundSegregationTx(client, refund, expiry, condition, user) {
  const batch = await refundSourceSnapshotTx(client,refund,expiry);
  await segregate(client,batch,Number(refund.quantity),condition,
    {id:refund.id},{id:refund.id},'customer_return');
}
