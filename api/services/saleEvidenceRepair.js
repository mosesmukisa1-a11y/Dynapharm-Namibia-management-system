import { createHash, randomUUID } from 'node:crypto';
import { businessDay } from './businessDates.js';

const num=v=>{
  if(v==null || v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;

// Pure planner: source IDs, exact products and conserved quantities only.
// No catalogue, surviving-stock, staff-name or timestamp-proximity lookup.
export function planSaleEvidenceRepair({sales,movements,allocations,audits,mirrors=[]}) {
  const eligible=[],review=[];
  for(const sale of sales){
    const ms=movements.filter(m=>m.reference_id===sale.id);
    const as=allocations.filter(a=>a.sale_reference===sale.id);
    const items=json(sale.items) || [];
    const fail=reason=>review.push({reference:sale.id,receipt:sale.sale_number,reason});
    if(!sale.sale_date || !Number.isFinite(new Date(sale.sale_date).valueOf())){
      fail('Missing valid original sale timestamp');continue;
    }
    if(!ms.length){fail('Missing exact source-linked posted movements');continue;}
    if(ms.some(m=>m.source_location!==sale.branch_id)){fail('Conflicting branch identity');continue;}
    if(!Array.isArray(items)){fail('Original captured items are not an array');continue;}
    const lines=[];let reason;
    for(const m of ms){
      const matches=as.filter(a=>a.movement_id===m.id);
      if(matches.length>1){reason='Multiple allocations claim the same movement';break;}
      const a=matches[0];
      if(a && (a.product_name!==m.product_name || Number(a.quantity)!==Math.abs(Number(m.quantity)) ||
        a.branch_id!==sale.branch_id)){reason='Allocation conflicts with exact movement';break;}
      const source=items.filter(i=>(i.product_name || i.name || i.description)===m.product_name);
      const sourceQty=source.reduce((s,i)=>s+Number(i.quantity ?? i.qty ?? 0),0);
      const movedQty=ms.filter(row=>row.product_name===m.product_name).reduce((s,row)=>s+Math.abs(Number(row.quantity)),0);
      if(!source.length || !Number.isFinite(sourceQty) || sourceQty!==movedQty){
        reason='Original captured product quantities do not match posted movements';break;
      }
      let dp=num(a?.snapshot?.financial_dp_unit);
      let charged=a?.snapshot?.revenue_total!=null?num(a.snapshot.revenue_total):
        num(a?.snapshot?.revenue_unit)==null?null:num(a.snapshot.revenue_unit)*Math.abs(Number(m.quantity));
      if(dp==null){
        const units=new Set(source.map(i=>num(i.dpPrice ?? i.dp)));
        if(units.size!==1 || units.has(null)){
          reason='Missing or ambiguous original captured DP/quantity';break;
        }
        dp=[...units][0]; // Captured sale DP only, never received cost.
      }
      // A charged header cannot be distributed across products without original evidence.
      if(charged==null){reason='Missing exact captured charged allocation';break;}
      const q=Math.abs(Number(m.quantity));
      if(!Number.isFinite(q) || q<=0){reason='Invalid captured movement quantity';break;}
      const candidate={dp_unit_price:dp,dp_value:dp*q,charged_value:charged,
        charged_unit_price:charged/q,branch_profit_value:charged-dp*q,
        receipt_no:sale.sale_number || sale.id,business_date:businessDay(new Date(sale.sale_date)),
        timezone:'Africa/Windhoek',sale_reference:sale.id,provenance:'reconstructed_exact_source'};
      const original=m.metadata?.sale_evidence || {},patch={};
      for(const [key,value] of Object.entries(candidate))if(original[key]==null && value!=null)patch[key]=value;
      if(Object.entries(candidate).some(([key,value])=>original[key]!=null &&
        key!=='provenance' && (typeof value==='number'
          ? !Number.isFinite(Number(original[key])) || Math.abs(Number(original[key])-value)>1e-8
          : original[key]!==value))){
        reason='Existing nonblank evidence conflicts; manual review required';break;
      }
      const mirrorId=a?.snapshot?.branch_movement_id || null;
      const mirror=mirrors.find(row=>row.id===mirrorId);
      let mirrorPatch=null;
      if(mirrorId){
        if(!mirror || mirror.branch_id!==sale.branch_id || mirror.reference!==sale.id ||
          mirror.product_name!==m.product_name || mirror.batch_no!==m.batch_no ||
          mirror.type!==m.movement_type || Math.abs(Number(mirror.quantity))!==q){
          reason='Captured branch mirror identity conflicts with original movement';break;
        }
        const saved=mirror.metadata?.sale_evidence || {};
        if(Object.entries(candidate).some(([key,value])=>saved[key]!=null &&
          key!=='provenance' && (typeof value==='number'
            ? !Number.isFinite(Number(saved[key])) || Math.abs(Number(saved[key])-value)>1e-8
            : saved[key]!==value))){
          reason='Existing branch mirror evidence conflicts; manual review required';break;
        }
        mirrorPatch=Object.fromEntries(Object.entries(candidate).filter(([key])=>saved[key]==null));
      }
      lines.push({movementId:m.id,mirrorId,mirrorPatch,
        allocationPatch:a && a.snapshot.financial_dp_unit==null ? {financial_dp_unit:dp} : null,
        productName:m.product_name,batchNo:m.batch_no,quantity:q,patch,dpTotal:dp*q,chargedTotal:charged});
      if(!a?.snapshot?.branch_movement_id)review.push({reference:sale.id,movement:m.id,
        reason:'Exact branch mirror identity was not captured; branch mirror repair requires original linkage'});
    }
    if(reason){fail(reason);continue;}
    const audit=audits.find(a=>a.record_id===sale.id && a.event_type==='sale_created');
    const dp=lines.reduce((n,l)=>n+l.dpTotal,0),charge=lines.reduce((n,l)=>n+l.chargedTotal,0);
    const details={branch:sale.branch_id,reference:sale.id,receiptNumber:sale.sale_number || sale.id,
      staff:sale.created_by || null,staffId:null,customerType:sale.customer_type,paymentMethod:sale.payment_method,
      dpTotal:dp,chargedTotal:num(sale.total),allocatedChargedTotal:charge,branchProfitTotal:charge-dp,
      dpComplete:true,lines,businessDate:businessDay(new Date(sale.sale_date)),
      timestamp:new Date(sale.sale_date).toISOString(),timezone:'Africa/Windhoek',provenance:'reconstructed_exact_source'};
    if(lines.some(l=>Object.keys(l.patch).length || l.allocationPatch ||
      Object.keys(l.mirrorPatch || {}).length) || !audit)
      eligible.push({reference:sale.id,branch:sale.branch_id,lines,audit:audit?null:details});
  }
  // Legacy prescriptions have no exact completion-to-BAT identity. Never group
  // distinct partial issues by report name/time; they require operator review.
  for(const m of movements.filter(m=>!sales.some(s=>s.id===m.reference_id)))
    review.push({reference:m.reference_id,movement:m.id,reason:'No exact completed receipt/session source; review prescription/legacy evidence'});
  const plan={eligible,review};
  return {...plan,fingerprint:hash({sales,movements,allocations,audits,mirrors}),planHash:hash(plan)};
}

// SELECT-only readiness check. Never create missing schema from the repair.
export async function readSaleRepairReadiness(client) {
  const row=(await client.query(`SELECT current_database() AS database_name,
    (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
     inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
     NOT pg_is_in_recovery() AS is_primary,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='mis_sales_audit' AND column_name='source_key') AS has_source_key,
    EXISTS(SELECT 1 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attname='source_key'
      WHERE n.nspname='public' AND t.relname='mis_sales_audit'
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
      AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum) AS has_source_key_unique`)).rows[0];
  const blockers=[];
  if(!row.has_source_key)blockers.push('Missing mis_sales_audit.source_key');
  if(!row.has_source_key_unique)blockers.push('Missing valid unique audit source_key index');
  return {databaseFingerprint:hash({database:row.database_name,oid:row.database_oid,
     server:row.server_address,port:row.server_port}),isPrimary:row.is_primary===true,
     schemaReady:blockers.length===0,blockers};
}

export async function readSaleRepairPlan(client,{reference,branch,from,to,limit=500}) {
  const readiness=await readSaleRepairReadiness(client);
  const sales=(await client.query(`SELECT * FROM branch_walkin_sales WHERE status='completed'
    AND ($1::text IS NULL OR id=$1 OR sale_number=$1)
    AND ($2::text IS NULL OR branch_id=$2)
    AND ($3::date IS NULL OR sale_date>=($3::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
    AND ($4::date IS NULL OR sale_date<(($4::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
    ORDER BY id LIMIT $5`,[reference || null,branch || null,from || null,to || null,limit+1])).rows;
  if(sales.length>limit)throw Error('Repair scope exceeds limit; narrow the dates or exact reference');
  const refs=sales.map(s=>s.id);
  if(reference && !refs.includes(reference))refs.push(reference);
  const movements=(await client.query(`SELECT * FROM stock_movements WHERE
    (reference_id=ANY($1) OR ($2::text IS NOT NULL AND source_location=$2
      AND created_at>=($3::date::timestamp AT TIME ZONE 'Africa/Windhoek')
      AND created_at<(($4::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')))
    AND status IN ('posted','approved') AND (movement_type LIKE '%sale%' OR movement_type IN ('prescription_dispense','campaign_free_item'))
    ORDER BY id LIMIT 5001`,[refs,reference?null:branch,from || null,to || null])).rows;
  if(movements.length>5000)throw Error('Too many movement rows; narrow repair scope');
  const allocations=(await client.query('SELECT * FROM stock_sale_allocations WHERE movement_id=ANY($1) ORDER BY movement_id',[movements.map(m=>m.id)])).rows;
  const audits=(await client.query(`SELECT * FROM mis_sales_audit WHERE record_id=ANY($1) AND event_type='sale_created' ORDER BY id`,[refs])).rows;
  const mirrors=(await client.query(`SELECT * FROM branch_inventory_movements
    WHERE id=ANY($1::text[]) ORDER BY id`,
  [allocations.map(a=>a.snapshot?.branch_movement_id).filter(Boolean)])).rows;
  const plan=planSaleEvidenceRepair({sales,movements,allocations,audits,mirrors});
  if(reference && !sales.length && !movements.length) {
    plan.review.push({reference,reason:'No exact completed receipt or source-linked movement found'});
  }
  return {...plan,readiness,
    fingerprint:hash({sourceFingerprint:plan.fingerprint,databaseFingerprint:readiness.databaseFingerprint}),
    planHash:hash({eligible:plan.eligible,review:plan.review,readiness})};
}

export async function applySaleRepairPlanTx(client,plan) {
  const readiness=await readSaleRepairReadiness(client);
   if(!readiness.isPrimary || plan.readiness?.isPrimary!==true)
     throw Error('Repair requires a fresh reviewed dry run on the confirmed primary database; replica plans are not approval values');
  if(!readiness.schemaReady)throw Error(`Repair blocked: ${readiness.blockers.join('; ')}. Use the supported schema deployment process; no repair DDL is allowed.`);
  if(!plan.readiness || readiness.databaseFingerprint!==plan.readiness.databaseFingerprint)
    throw Error('Repair target differs from the reviewed database; run and review a new dry run');
  const refs=plan.eligible.map(s=>s.reference);
  const invariant=async()=>hash((await client.query(`SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_array(id,quantity,unit_cif,unit_dp) ORDER BY id),'[]'::jsonb)
      FROM stock_movements WHERE reference_id=ANY($1)) AS movement_values,
    (SELECT COALESCE(jsonb_agg(jsonb_build_array(movement_id,quantity) ORDER BY movement_id),'[]'::jsonb)
      FROM stock_sale_allocations WHERE sale_reference=ANY($1)) AS allocation_quantities,
    (SELECT COALESCE(jsonb_agg(to_jsonb(s)-'metadata' ORDER BY id),'[]'::jsonb)
      FROM branch_walkin_sales s WHERE id=ANY($1)) AS receipt_values,
    (SELECT COALESCE(jsonb_agg(to_jsonb(m)-'metadata' ORDER BY id),'[]'::jsonb)
      FROM branch_inventory_movements m WHERE reference=ANY($1)) AS mirror_values`,[refs])).rows);
  const before=await invariant();
  const repairEvents=[];
  const operationId=randomUUID();
  for(const sale of plan.eligible){
    const evidenceLines=[];
    for(const line of sale.lines) {
      const movementBefore=(await client.query(
        "SELECT metadata->'sale_evidence' AS evidence FROM stock_movements WHERE id=$1 FOR UPDATE",
        [line.movementId])).rows[0];
      if(!movementBefore)throw Error(`Repair source movement ${line.movementId} disappeared`);
      const allocationBefore=(await client.query(
        "SELECT snapshot->'financial_dp_unit' AS financial_dp_unit FROM stock_sale_allocations WHERE movement_id=$1 FOR UPDATE",
        [line.movementId])).rows[0] || null;
      const mirrorBefore=line.mirrorId?(await client.query(
        "SELECT metadata->'sale_evidence' AS evidence FROM branch_inventory_movements WHERE id=$1 FOR UPDATE",
        [line.mirrorId])).rows[0]:null;
      if(line.mirrorId && !mirrorBefore)throw Error(`Repair source mirror ${line.mirrorId} disappeared`);
      if(line.allocationPatch)await client.query(`UPDATE stock_sale_allocations SET snapshot=$1::jsonb || jsonb_strip_nulls(snapshot)
        WHERE movement_id=$2`,[JSON.stringify(line.allocationPatch),line.movementId]);
      // Each original field wins, including a valid zero. Never replace any
      // original nonblank evidence, even if the planner proposed a patch.
      if(line.movementId&&line.patch&&Object.keys(line.patch).length)
        await client.query(`UPDATE stock_movements SET metadata=COALESCE(metadata,'{}'::jsonb) ||
          jsonb_build_object('sale_evidence',$1::jsonb || jsonb_strip_nulls(COALESCE(metadata->'sale_evidence','{}'::jsonb)))
          WHERE id=$2`,[JSON.stringify(line.patch),line.movementId]);
      if(line.mirrorId&&line.mirrorPatch&&Object.keys(line.mirrorPatch).length)
        await client.query(`UPDATE branch_inventory_movements SET metadata=COALESCE(metadata,'{}'::jsonb) ||
          jsonb_build_object('sale_evidence',$1::jsonb || jsonb_strip_nulls(COALESCE(metadata->'sale_evidence','{}'::jsonb)))
          WHERE id=$2`,[JSON.stringify(line.mirrorPatch),line.mirrorId]);
      const movementAfter=(await client.query(
        "SELECT metadata->'sale_evidence' AS evidence FROM stock_movements WHERE id=$1",
        [line.movementId])).rows[0];
      const allocationAfter=(await client.query(
        "SELECT snapshot->'financial_dp_unit' AS financial_dp_unit FROM stock_sale_allocations WHERE movement_id=$1",
        [line.movementId])).rows[0] || null;
      const mirrorAfter=line.mirrorId?(await client.query(
        "SELECT metadata->'sale_evidence' AS evidence FROM branch_inventory_movements WHERE id=$1",
        [line.mirrorId])).rows[0]:null;
      evidenceLines.push({
        movementId:line.movementId,
        branchMovementId:line.mirrorId || null,
        productName:line.productName,
        batchNo:line.batchNo,
        quantity:line.quantity,
        before:{
          movementSaleEvidence:movementBefore.evidence ?? null,
          allocationFinancialDpUnit:allocationBefore?.financial_dp_unit ?? null,
          branchMovementSaleEvidence:mirrorBefore?.evidence ?? null,
        },
        after:{
          movementSaleEvidence:movementAfter?.evidence ?? null,
          allocationFinancialDpUnit:allocationAfter?.financial_dp_unit ?? null,
          branchMovementSaleEvidence:mirrorAfter?.evidence ?? null,
        },
      });
    }
    if(sale.audit)await client.query(`INSERT INTO mis_sales_audit(event_type,record_id,user_name,details,created_at,source_key)
      VALUES('sale_created',$1,$2,$3,$4,$5) ON CONFLICT(source_key) DO NOTHING`,
    [sale.reference,sale.audit.staff,JSON.stringify(sale.audit),sale.audit.timestamp,`walkin:${sale.reference}`]);
    const event=(await client.query(`INSERT INTO mis_sales_audit
      (event_type,record_id,details,created_at,source_key)
      VALUES('sale_evidence_repaired',$1,$2,NOW(),$3)
      ON CONFLICT(source_key) DO NOTHING RETURNING id`,
    [sale.reference,JSON.stringify({
      executor:'repair-sale-evidence CLI',
      operationId,
      planHash:plan.planHash,
      fingerprint:plan.fingerprint,
      sourceReference:sale.reference,
      branch:sale.branch,
      lines:evidenceLines,
    }),`sale-evidence-repair:${operationId}:${sale.reference}`])).rows[0];
    if(event)repairEvents.push({id:String(event.id),reference:sale.reference});
  }
  const after=await invariant();
  if(after!==before)throw Error('Repair invariant failed: quantities or financial values changed');
  return {invariantBefore:before,invariantAfter:after,quantitiesAndPostingsUnchanged:true,
    repairEvents};
}
