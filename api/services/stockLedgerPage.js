import { getMany } from '../db.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';
import { movementSaleEvidence } from './saleEvidence.js';
import { validateBusinessDates, businessDatePredicate } from './businessDates.js';
import { classifySaleCostEvidence } from '../../shared/saleCostEvidence.js';

// Cursor order includes source: distinct legacy records with identical IDs/times
// must remain reachable. Only persisted mirror IDs authorize deduplication.
export async function stockLedgerPage(url, scope) {
  const branch = url.searchParams.get('branch');
  const location = url.searchParams.get('location');
  if (scope.enforced && [branch, location].some(value => value && !scope.branches.includes(value))) {
    const error = new Error('Access denied'); error.status = 403; throw error;
  }
  const limitText = url.searchParams.get('limit') || '100';
  if (!/^[1-9]\d*$/.test(limitText)) throw Object.assign(new Error('Invalid limit'), {status:400});
  const limit = Math.min(Number(limitText), 1000);
  const from = url.searchParams.get('date_from'), to = url.searchParams.get('date_to');
  validateBusinessDates(from, to);
  const params = [], where = [];
  const bind = value => {params.push(value); return `$${params.length}`;};
  const owners = branch ? branchSearchTerms(branch) : scope.enforced ? scope.branches.flatMap(branchSearchTerms) : null;
  if (owners) {
    const p = bind(owners);
    where.push(`(LOWER(REPLACE(record->>'branch_id',' ','_'))=ANY(${p}::text[])
      OR (source='central' AND (LOWER(REPLACE(record->>'source_location',' ','_'))=ANY(${p}::text[])
      OR LOWER(REPLACE(record->>'destination_location',' ','_'))=ANY(${p}::text[]))))`);
  }
  if (scope.enforced) where.push("source<>'warehouse'");
  if (from) where.push(businessDatePredicate('created_at', bind(from)));
  if (to) where.push(businessDatePredicate('created_at', bind(to), true));
  for (const [param, field] of [['type','movement_type'],['status','status'],['reference_id','reference_id']]) {
    const value = url.searchParams.get(param);
    if (value) where.push(`record->>'${field}'=${bind(value)}`);
  }
  for (const [param, field] of [['product_name','product_name'],['batch_no','batch_no']]) {
    const value = url.searchParams.get(param)?.trim();
    if (value) where.push(`record->>'${field}' ILIKE ${bind(`%${value.replace(/[\\%_]/g,'\\$&')}%`)} ESCAPE '\\'`);
  }
  if (location) {
    const p = bind(location);
    where.push(`(${p} IN (record->>'source_location',record->>'destination_location',record->>'warehouse_id',record->>'branch_id'))`);
  }
  for (const [param, field] of [['warehouse','warehouse_id'],['product','product_id']]) {
    const value = url.searchParams.get(param);
    if (value) where.push(`record->>'${field}'=${bind(value)}`);
  }
  const search = url.searchParams.get('search')?.trim();
  if (search) {
    const p = bind(`%${search.replace(/[\\%_]/g,'\\$&')}%`);
    where.push(`(record::text ILIKE ${p} ESCAPE '\\' OR receipt_no ILIKE ${p} ESCAPE '\\')`);
  }
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    let position;
    try { position = JSON.parse(Buffer.from(cursor,'base64url').toString()); } catch {}
    if (!Array.isArray(position) || position.length !== 3 || position.some(value=>typeof value!=='string') ||
      !Number.isFinite(Date.parse(position[0])) || cursor.length>1000) {
      throw Object.assign(new Error('Invalid ledger cursor'), {status:400});
    }
    where.push(`(created_at,id,source)<(${bind(position[0])}::timestamptz,${bind(position[1])}::text,${bind(position[2])}::text)`);
  }
  const pageLimit = bind(limit + 1);
  const rows = await getMany(`WITH sources AS (
    SELECT 'central'::text AS source,m.id,m.created_at,to_jsonb(m) AS record FROM stock_movements m
    UNION ALL
    SELECT 'branch',b.id,b.created_at,to_jsonb(b)||jsonb_build_object(
      'movement_type',b.type,'reference_id',b.reference,'source_location',COALESCE(b.source_branch_id,b.branch_id),
      'destination_location',b.destination_branch_id,'status','posted')
    FROM branch_inventory_movements b WHERE NOT EXISTS (
      SELECT 1 FROM stock_movements m WHERE
        m.metadata->'sale_evidence'->>'branch_movement_id'=b.id OR
        b.metadata->'sale_evidence'->>'movement_id'=m.id)
    UNION ALL
    SELECT 'warehouse',w.id,w.created_at,to_jsonb(w)||jsonb_build_object(
      'reference_id',COALESCE(to_jsonb(w)->>'reference_id',to_jsonb(w)->>'reference'),
      'source_location',COALESCE(to_jsonb(w)->>'source_location',w.warehouse_id))
    FROM warehouse_inventory_movements w
  ), evidence AS (
    SELECT s.*,COALESCE(record->'metadata'->'sale_evidence'->>'receipt_no',
      (SELECT COALESCE(w.sale_number,to_jsonb(w)->'data'->>'receipt_number',to_jsonb(w)->'data'->>'saleNumber')
       FROM branch_walkin_sales w WHERE w.id=s.record->>'reference_id' LIMIT 1)) AS receipt_no
    FROM sources s
  ) SELECT * FROM evidence ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC,id DESC,source DESC LIMIT ${pageLimit}`,params);
  const more = rows.length>limit;
  const selected = rows.slice(0,limit);
  const movements = selected.map(({record,source,receipt_no}) => {
    const normalized = {...record,ledger_source:source,...movementSaleEvidence(record)};
    if (!normalized.receipt_no) normalized.receipt_no=receipt_no;
    return normalized;
  });
  const identities = movements.map(row=>row.metadata?.sale_evidence?.movement_id || row.id);
  if (identities.length) {
    const allocations = await getMany('SELECT movement_id,quantity,snapshot FROM stock_sale_allocations WHERE movement_id=ANY($1::text[])',[identities]);
    for (const row of movements) {
      const parts=allocations.filter(part=>part.movement_id===(row.metadata?.sale_evidence?.movement_id || row.id));
      const qty=parts.reduce((sum,part)=>sum+Number(part.quantity),0);
      if (!qty || Math.abs(qty-Math.abs(Number(row.quantity)))>1e-8) continue;
      const unit=field=>parts.every(part=>{
        const n=part.snapshot?.[field];
        return n!=null && n!=='' && Number.isFinite(Number(n)) &&
          (Number(n)>0 || (Number(n)===0 && part.snapshot.zeroCostApproved===true));
      }) ? parts.reduce((sum,part)=>sum+Number(part.quantity)*Number(part.snapshot[field]),0)/qty : null;
      row.original_received_dpc=unit('unit_dp');row.original_received_cost=unit('unit_cost');
      row.cost_evidence_status=classifySaleCostEvidence({originalReceivedDPC:row.original_received_dpc,
        originalReceivedCost:row.original_received_cost,zeroCostApproved:parts.every(part=>part.snapshot.zeroCostApproved===true)});
    }
  }
  const last=selected.at(-1);
  return {success:true,movements,total:movements.length,hasMore:more,
    // JSON timestamp retains PostgreSQL microseconds; JS Date would truncate
    // them and could skip unseen rows within the cursor's millisecond.
    nextCursor:more ? Buffer.from(JSON.stringify([last.record.created_at,last.id,last.source])).toString('base64url') : null,
    coverage:'Paged recorded evidence; only persisted mirror identities are deduplicated.'};
}
