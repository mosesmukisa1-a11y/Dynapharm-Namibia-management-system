import { createHash, randomUUID } from 'node:crypto';
import { withTransaction } from '../db.js';
import { actor, isGM, fail } from './controlledStock.js';
import { postStockMovementTx, recomputeInventoryBalanceTx } from './stockEngine.js';
import { getStockCostProjection } from './stockCostReporting.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';

export const CLEARANCE_REASON = 'GM-directed branch stock clearance; historical records retained';
export const CLEARANCE_CONFIRMATION = 'WRITE OFF BRANCH STOCK';
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const protectedClearanceProduct = name =>
  /(digrow|herbawarisanmaharani|herbalwarisanmaharani|dynaserenoa|dynaseronoa)/.test(norm(name));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantity = row => Number(row.quantity);
function authorize(user) {
  if (!user) fail('Authentication required', 401);
  if (!isGM(user)) fail('GM or administrator access required', 403);
  return actor(user);
}
async function verifyCurrentStaff(client,user) {
  // A signed but stale role or an initial/default-password session is not
  // sufficient authority for this destructive, company-wide operation.
  const staff=(await client.query(`SELECT id,role,is_active,must_change_password
    FROM users WHERE id=$1 FOR SHARE`,[actor(user)])).rows[0];
  if (!staff || !staff.is_active || !isGM(staff)) fail('Current active GM or administrator staff authorization required',403);
  if (staff.must_change_password) fail('Complete your staff password reset before using branch clearance',403);
}
async function schema(client) {
  const tables = ['stock_control_operations', 'stock_control_financial_entries',
    'stock_segregated_batches', 'stock_transfer_allocations'];
  const missing = (await client.query(
    'SELECT t FROM unnest($1::text[]) t WHERE to_regclass(t) IS NULL', [tables],
  )).rows;
  if (missing.length) fail('Controlled stock setup is missing. Review the registered additive setup before using clearance; no schema was changed.', 503);
}

// One statement / MVCC snapshot. Exact branch registry IDs, never inferred
// warehouse names or a display-name merge. Raw JSON text preserves decimals.
async function readState(client, branchIds) {
  const aliases=[...new Set(branchIds.flatMap(id=>[id,...branchSearchTerms(id)]).map(norm))];
  const { rows: [state] } = await client.query(`SELECT
    COALESCE((SELECT json_agg(b ORDER BY b.id) FROM
      (SELECT id,name,code,status FROM branches WHERE id=ANY($1)) b),'[]') AS branches,
    COALESCE((SELECT json_agg(json_build_object('type','branch','id',b.id,'raw',row_to_json(b)::text) ORDER BY b.id)
      FROM branch_inventory_batches b WHERE b.branch_id=ANY($1)),'[]') AS physical,
    COALESCE((SELECT json_agg(json_build_object('type','segregated','id',q.id,'raw',row_to_json(q)::text) ORDER BY q.id)
      FROM stock_segregated_batches q WHERE q.source_type='branch' AND q.location=ANY($1)),'[]') AS held,
    COALESCE((SELECT json_agg(row_to_json(m) ORDER BY m.id) FROM stock_movements m
      WHERE m.movement_type='write_off' AND m.status='pending_approval'
        AND COALESCE(m.source_location_type,'branch')='branch'
        AND (LOWER(REGEXP_REPLACE(m.source_location,'[^a-zA-Z0-9]','','g'))=ANY($2)
         OR LOWER(REGEXP_REPLACE(m.source_location,'[^a-zA-Z0-9]','','g')) IN
           (SELECT LOWER(REGEXP_REPLACE(name,'[^a-zA-Z0-9]','','g')) FROM branches WHERE id=ANY($1)))),'[]') AS pending,
    COALESCE((SELECT json_agg(json_build_object('id',a.id,'transfer_id',a.transfer_id,'source_id',a.source_id,
       'quantity',a.quantity,'snapshot',a.snapshot,'location',COALESCE(
         (SELECT b.branch_id FROM branch_inventory_batches b WHERE b.id=a.source_id),t.from_warehouse)) ORDER BY a.id)
      FROM stock_transfer_allocations a JOIN stock_transfers t ON t.id=a.transfer_id
      WHERE a.source_type='branch' AND t.status='approved' AND (t.from_warehouse=ANY($1)
       OR EXISTS(SELECT 1 FROM branch_inventory_batches b WHERE b.id=a.source_id AND b.branch_id=ANY($1)))),'[]') AS reserved,
    COALESCE((SELECT json_agg(row_to_json(s) ORDER BY s.id) FROM stock_adjustments s
      WHERE s.status='pending' AND s.target_type='branch_inventory'
        AND s.target_id IN (SELECT id FROM branch_inventory_batches WHERE branch_id=ANY($1))),'[]') AS pending_edits,
    COALESCE((SELECT json_agg(json_build_object('id',o.id,'lines',o.lines) ORDER BY o.id)
      FROM stock_control_operations o WHERE o.kind<>'branch_clearance'
       AND o.status IN ('draft','submitted','partially_reviewed','partially_dispatched')
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) l
         WHERE l->'snapshot'->>'location'=ANY($1)
          AND COALESCE(l->'snapshot'->>'source_type',l->'snapshot'->>'batch_type')='branch')),'[]') AS open_operations`, [branchIds,aliases]);
  return state;
}

// Original layer values stay in PostgreSQL numeric arithmetic. Never use the
// current price list or branch unit_price (which can be DP) as original CIF.
async function costs(client, entries) {
  if (!entries.length) return new Map();
  const results = (await client.query(`WITH e AS (
    SELECT v->>'type' AS type,v->>'id' AS id,(v->>'raw')::jsonb AS r
    FROM jsonb_array_elements($1::jsonb) v
  ), sources AS (
    SELECT *,CASE WHEN type='branch' THEN
      CASE WHEN COALESCE(r->'metadata'->>'provenance_conflict','') NOT IN ('','false','null') THEN '[]'::jsonb
       WHEN jsonb_typeof(r->'metadata'->'cost_layers')='array' AND jsonb_array_length(r->'metadata'->'cost_layers')>0
        THEN r->'metadata'->'cost_layers'
       WHEN r->'metadata'->'original_source'->>'id'=r->>'source_batch_id'
        THEN jsonb_build_array(jsonb_build_object('quantity',r->'quantity','source',r->'metadata'->'original_source'))
       ELSE '[]'::jsonb END
      ELSE CASE WHEN jsonb_typeof(r->'snapshot'->'return_cost_layers')='array' THEN r->'snapshot'->'return_cost_layers'
       WHEN jsonb_typeof(r->'snapshot'->'cost_layers')='array' THEN r->'snapshot'->'cost_layers'
       ELSE jsonb_build_array(jsonb_build_object('quantity',r->'quantity','source',
        jsonb_build_object('cif_unit_cost',r->'snapshot'->'unit_cost'))) END END AS layers FROM e
  ), totals AS (
    SELECT s.type,s.id,(s.r->>'quantity')::numeric AS qty,
      COALESCE(sum((l->>'quantity')::numeric),0) AS layer_qty,
      COALESCE(sum((l->>'quantity')::numeric) FILTER(WHERE c.unit IS NOT NULL),0) AS known_qty,
      COALESCE(sum((l->>'quantity')::numeric*c.unit),0) AS known_cost,
      COALESCE(bool_or((l->>'quantity')::numeric<=0),false) AS invalid_layer
    FROM sources s LEFT JOIN LATERAL jsonb_array_elements(s.layers) l ON true
    LEFT JOIN LATERAL (SELECT CASE WHEN COALESCE(l->'source'->>'received_unit_cif_exact',
      l->'source'->>'original_unit_cif',l->'source'->>'cif_unit_cost') ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
      THEN COALESCE(l->'source'->>'received_unit_cif_exact',l->'source'->>'original_unit_cif',
        l->'source'->>'cif_unit_cost')::numeric ELSE NULL END AS unit) c ON true
    GROUP BY s.type,s.id,s.r
  ) SELECT type,id,known_cost::text,layer_qty::text,invalid_layer,
    GREATEST(0,qty-known_qty)::text AS missing_qty,
    CASE WHEN known_qty=qty AND qty>0 THEN (known_cost/qty)::text ELSE NULL END AS unit_cif
    FROM totals`, [JSON.stringify(entries)])).rows;
  return new Map(results.map(r => [r.type + ':' + r.id, r]));
}

async function plan(client, state) {
  const entries = [...state.physical, ...state.held].filter(e => quantity(JSON.parse(e.raw)) !== 0);
  const candidateEntries = entries.filter(e => {
    const row = JSON.parse(e.raw);
    return !protectedClearanceProduct(e.type === 'branch' ? row.product_name : row.snapshot.product_name);
  });
  const values = await costs(client, candidateEntries);
  const rows = entries.map(e => {
    const raw = JSON.parse(e.raw), held = e.type === 'segregated';
    const product = held ? raw.snapshot.product_name : raw.product_name;
    const location = held ? raw.location : raw.branch_id;
    const flags = [];
    if (!product || !location) flags.push('Missing product or branch identity');
    if (!Number.isSafeInteger(quantity(raw)) || quantity(raw) < 0) flags.push('Invalid physical quantity; reviewed correction required');
    if (!held && !['in_stock', 'available', 'active'].includes(raw.status)) flags.push(`Stock status ${raw.status} disagrees with clearance eligibility`);
    if (held && raw.purpose === 'supplier_return') flags.push('Supplier-return hold must be resolved through its own workflow');
    // Legacy/ambiguous labels may block review, but never authorize a deduction
    // from another registered ID. Resolve prior requests before clearing.
    const branchLabel=state.branches.find(b=>b.id===location)?.name;
    const locationAliases=[location,branchLabel,...branchSearchTerms(location)].map(norm);
    const pending = state.pending.filter(p => !protectedClearanceProduct(p.product_name) &&
      locationAliases.includes(norm(p.source_location)));
    if (pending.length) flags.push('Pending or ambiguous branch write-off: ' + pending.map(p => p.id).join(', '));
    const edits = !held ? state.pending_edits.filter(s => s.target_id === raw.id) : [];
    if (edits.length) flags.push('Pending stock edit: ' + edits.map(s => s.id).join(', '));
    const reserved = state.reserved.filter(a => a.location === location &&
      (a.source_id === raw.id || norm(a.snapshot.product_name) === norm(product)));
    if (reserved.length) flags.push('Approved transfer reservation: ' + [...new Set(reserved.map(a => a.transfer_id))].join(', '));
    const open = state.open_operations.filter(o => o.lines.some(l =>
      l.snapshot?.location === location && (l.snapshot.source_type || l.snapshot.batch_type)==='branch'
       && norm(l.snapshot.product_name) === norm(product)));
    if (open.length) flags.push('Open controlled stock operation: ' + open.map(o => o.id).join(', '));
    const cost = values.get(e.type + ':' + e.id);
    if (cost && (cost.invalid_layer || !Number.isFinite(Number(cost.layer_qty)))) flags.push('Invalid original cost layers');
    if (cost && Number(cost.layer_qty) > quantity(raw)) flags.push('Original cost layers exceed current physical quantity');
    return { id: e.id, type: e.type, branch_id: location, product_name: product,
      batch_no: held ? raw.snapshot.batch_no : raw.batch_no,
      expiry_date: held ? raw.snapshot.expiry_date : raw.expiry_date,
      quantity: quantity(raw), protected: protectedClearanceProduct(product),
      stock_unit: held ? raw.snapshot.unit || 'unit' : raw.unit || 'unit',
      flags, cost: cost || { known_cost: '0', missing_qty: String(quantity(raw)), unit_cif: null },
      raw_before_json: e.raw };
  });
  const candidates = rows.filter(r => !r.protected);
  const protectedRows = rows.filter(r => r.protected);
  return { rows: candidates, protected_rows: protectedRows,
    total_units: candidates.reduce((s,r) => s + r.quantity, 0),
    protected_units: protectedRows.reduce((s,r) => s + r.quantity, 0),
    missing_cost_units: candidates.reduce((s,r) => s + Number(r.cost.missing_qty), 0),
    blockers: candidates.filter(r => r.flags.length),
    reservation_blockers: state.reserved.filter(a => !protectedClearanceProduct(a.snapshot.product_name)) };
}
function visible(operation) {
  const manifest = operation.lines[0];
  const strip = r => { const { raw_before_json, ...safe } = r; return safe; };
  return { id: operation.id, status: operation.status, reason: operation.reason,
    created_at: operation.created_at, updated_at: operation.updated_at,
    branch_ids: manifest.branch_ids, all_branches: manifest.all_branches === true, fingerprint: manifest.fingerprint,
    ...manifest.summary, rows: manifest.rows.map(strip), protected_rows: manifest.protected_rows.map(strip),
    history: operation.review_history };
}
export async function clearanceOptions(user) {
  authorize(user);
  return withTransaction(async client => {
    await verifyCurrentStaff(client,user);
    await schema(client);
    const branches = (await client.query('SELECT id,name,code,status FROM branches ORDER BY name,id')).rows;
    const history = (await client.query(`SELECT id,status,reason,created_at,updated_at,review_history
      FROM stock_control_operations WHERE kind='branch_clearance' AND created_by=$1
      ORDER BY created_at DESC LIMIT 20`, [actor(user)])).rows;
    return { branches, history, reason: CLEARANCE_REASON, confirmation: CLEARANCE_CONFIRMATION };
  });
}
export async function previewClearance(user, body) {
  authorize(user);
  return withTransaction(async client => {
    await verifyCurrentStaff(client,user);
    await schema(client);
    if (body.branch_ids !== undefined && !Array.isArray(body.branch_ids)) fail('Branch IDs must be a list');
    const all = (await client.query('SELECT id FROM branches ORDER BY id')).rows.map(r => r.id);
    const ids = body.branch_ids?.length ? [...new Set(body.branch_ids)].sort() : all;
    if (!Array.isArray(body.branch_ids ?? []) || !ids.length || ids.some(id => !all.includes(id)))
      fail('Select valid registered branch IDs; warehouse aliases are not branch scope');
    const state = await readState(client, ids);
    const prepared = await plan(client, state);
    const { rows, protected_rows, blockers, reservation_blockers, ...summary } = prepared;
    summary.blocked_rows = blockers.length;
    summary.reserved_transfers = [...new Set(reservation_blockers.map(r => r.transfer_id))];
    const manifest = { branch_ids: ids, all_branches: !body.branch_ids?.length,
      fingerprint: hash(state), summary, rows, protected_rows };
    const operation = (await client.query(`INSERT INTO stock_control_operations
      (id,kind,status,reason,created_by,lines) VALUES($1,'branch_clearance','draft',$2,$3,$4) RETURNING *`,
    [randomUUID(),CLEARANCE_REASON,actor(user),JSON.stringify([manifest])])).rows[0];
    return visible(operation);
  });
}
export async function readClearance(user, id) {
  authorize(user);
  return withTransaction(async client => {
    await verifyCurrentStaff(client,user);
    await schema(client);
    const op = (await client.query(`SELECT * FROM stock_control_operations
      WHERE id=$1 AND kind='branch_clearance'`, [id])).rows[0];
    if (!op) fail('Clearance not found',404);
    if (op.created_by !== actor(user)) fail('This clearance belongs to another GM session identity',403);
    return visible(op);
  });
}
export async function executeClearance(user, body) {
  authorize(user);
  if (body.confirmation !== CLEARANCE_CONFIRMATION || body.backup_verified !== true)
    fail('Exact confirmation and a recoverable-backup attestation are required');
  return withTransaction(async client => {
    await verifyCurrentStaff(client,user);
    await schema(client);
    await client.query("SET LOCAL lock_timeout='5s'");
    // Controlled maintenance window: stops concurrent physical changes and
    // pending/reservation phantoms, not just updates to the initially found rows.
    await client.query(`LOCK TABLE branch_inventory_batches,stock_segregated_batches,
      stock_movements,stock_transfers,stock_transfer_allocations,stock_control_operations,stock_adjustments,branches IN EXCLUSIVE MODE`);
    const op = (await client.query(`SELECT * FROM stock_control_operations
      WHERE id=$1 AND kind='branch_clearance' FOR UPDATE`, [body.id])).rows[0];
    if (!op) fail('Clearance preview not found', 404);
    if (op.created_by !== actor(user)) fail('Use the preview created by your own GM session', 403);
    if (op.status === 'approved') return { ...visible(op), unchanged: true };
    if (op.status !== 'draft') fail('Clearance is not awaiting confirmation', 409);
    const manifest = op.lines[0];
    if (manifest.all_branches) {
      const registry=(await client.query('SELECT id FROM branches')).rows;
      if (registry.length!==manifest.branch_ids.length || registry.some(b=>!manifest.branch_ids.includes(b.id)))
        fail('The branch register changed after this all-branch preview. Refresh the preview; nothing was written off.',409);
    }
    const current = await readState(client, manifest.branch_ids);
    if (hash(current) !== manifest.fingerprint) fail('Stock, holds or pending allocations changed. Refresh the preview; nothing was written off.', 409);
    const prepared = await plan(client, current);
    if (prepared.blockers.length || prepared.reservation_blockers.length)
      fail('Clearance is blocked by inconsistent stock, pending write-offs, reservations or open operations. Nothing was changed.', 409);
    if (!prepared.rows.length) fail('There is no non-exempt stock to write off', 409);
    if (prepared.missing_cost_units && body.accept_missing_cost !== true)
      fail('Acknowledge missing original cost evidence; no catalogue fallback will be posted');
    const targets = new Map();
    for (const line of prepared.rows) {
      if (line.protected || protectedClearanceProduct(line.product_name)) fail('Protected product guard failed', 409);
      if (line.type === 'branch') {
        // Keep the row and source identity, but retire its active cost layers.
        // The exact original metadata/decimals remain in the operation audit;
        // retaining positive active layers on a zero row breaks later receipts.
        await client.query(`UPDATE branch_inventory_batches SET quantity=0,status='out_of_stock',
          metadata=CASE WHEN jsonb_typeof(metadata->'cost_layers')='array'
            THEN jsonb_set(metadata,'{cost_layers}','[]'::jsonb) ELSE metadata END,
          updated_at=NOW() WHERE id=$1`, [line.id]);
      } else await client.query('UPDATE stock_segregated_batches SET quantity=0,updated_at=NOW() WHERE id=$1', [line.id]);
      const source = line.type === 'branch' ? line.branch_id : `quarantine:${line.branch_id}`;
      const event = await postStockMovementTx(client, {
        id: 'SM-' + randomUUID(), productName: line.product_name, batchNo: line.batch_no,
        expiryDate: line.expiry_date, quantity: line.quantity, movementType: 'write_off',
        sourceLocation: source, sourceLocationType: line.type === 'branch' ? 'branch' : 'quarantine',
        referenceType: 'branch_clearance', referenceId: op.id, createdBy: actor(user),
        unitCIF: line.cost.unit_cif, unitDP: null, notes: CLEARANCE_REASON,
      });
      line.movement_id = event.movementId;
      await client.query(`UPDATE stock_movements SET approved_by=$2,write_off_reason=$3,
        disposal_status='pending_disposal',metadata=$4 WHERE id=$1`,
      [event.movementId,actor(user),CLEARANCE_REASON,JSON.stringify({ clearance_id:op.id,
        physical_type:line.type,physical_batch_id:line.id,known_original_cost:line.cost.known_cost,
        missing_original_cost_quantity:line.cost.missing_qty })]);
      if (line.type === 'branch') await client.query(`INSERT INTO branch_inventory_movements
        (id,branch_id,type,product_name,batch_no,quantity,related_batch_id,reference,notes,created_by,metadata)
        VALUES($1,$2,'write_off',$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(),line.branch_id,line.product_name,line.batch_no,line.quantity,line.id,op.id,CLEARANCE_REASON,
        actor(user),JSON.stringify({ expiry_date:line.expiry_date,delta:-line.quantity,clearance_id:op.id })]);
      if (Number(line.cost.known_cost) > 0) await client.query(`INSERT INTO stock_control_financial_entries
        (id,operation_id,line_id,event,debit_account,credit_account,amount,created_by)
        VALUES($1,$2,$3,'write_off','write_off_expense','inventory',$4,$5)`,
      [randomUUID(),op.id,line.type+':'+line.id,line.cost.known_cost,actor(user)]);
      for (const target of event.recomputeTargets) targets.set(JSON.stringify(target), target);
      if (line.type === 'segregated') targets.set(JSON.stringify(['held',line.id]), {
        locationType:'branch',locationId:line.branch_id,productName:line.product_name,
        batchNo:line.batch_no || '',expiryDate:line.expiry_date });
    }
    // No mutation of warehouse stock, exemptions, old sales/orders/payments, or
    // cost layers. Recompute cache from the same post-write transaction snapshot.
    const projection = await getStockCostProjection({}, async (sql,params) => (await client.query(sql,params)).rows);
    for (const target of targets.values()) await recomputeInventoryBalanceTx(client,target,projection);
    manifest.rows = prepared.rows;
    const history = [...op.review_history, { action:'execute',actor:actor(user),at:new Date().toISOString(),
      backup_attested:true,missing_original_cost_acknowledged:body.accept_missing_cost === true,
      units:prepared.total_units,rows:prepared.rows.length }];
    const saved = (await client.query(`UPDATE stock_control_operations SET status='approved',
      lines=$2,review_history=$3,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [op.id,JSON.stringify([manifest]),JSON.stringify(history)])).rows[0];
    return visible(saved);
  });
}
