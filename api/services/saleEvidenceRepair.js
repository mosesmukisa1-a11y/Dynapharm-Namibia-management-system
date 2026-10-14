import { createHash } from 'node:crypto';
import { businessDay } from './businessDates.js';
import { movementSaleEvidence } from './saleEvidence.js';

const num=v=>{
  if(v==null || v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;

// Pure planner: source IDs, exact products and conserved quantities only.
// No catalogue, surviving-stock, staff-name or timestamp-proximity lookup.
export function planSaleEvidenceRepair({sales,movements,allocations,audits}) {
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
    const lines=[];let reason;
    for(const m of ms){
      const a=as.find(a=>a.movement_id===m.id);
      if(a && (a.product_name!==m.product_name || Number(a.quantity)!==Math.abs(Number(m.quantity)) ||
        a.branch_id!==sale.branch_id)){reason='Allocation conflicts with exact movement';break;}
      let dp=num(a?.snapshot?.financial_dp_unit);
      let charged=a?.snapshot?.revenue_total!=null?num(a.snapshot.revenue_total):
        num(a?.snapshot?.revenue_unit)==null?null:num(a.snapshot.revenue_unit)*Math.abs(Number(m.quantity));
      if(dp==null){
        const source=items.filter(i=>(i.product_name || i.name || i.description)===m.product_name);
        const units=new Set(source.map(i=>num(i.dpPrice ?? i.dp)));
        const sourceQty=source.reduce((s,i)=>s+Number(i.quantity ?? i.qty ?? 0),0);
        const movedQty=ms.filter(row=>row.product_name===m.product_name).reduce((s,row)=>s+Math.abs(Number(row.quantity)),0);
        if(!source.length || units.size!==1 || units.has(null) || sourceQty!==movedQty){
          reason='Missing or ambiguous original captured DP/quantity';break;
        }
        dp=[...units][0]; // Captured sale DP only, never received cost.
      }
      // A charged header cannot be distributed across products without original evidence.
      if(charged==null){reason='Missing exact captured charged allocation';break;}
      const q=Math.abs(Number(m.quantity)),existing=movementSaleEvidence(m);
      if(!Number.isFinite(q) || q<=0){reason='Invalid captured movement quantity';break;}
      const candidate={dp_unit_price:dp,dp_value:dp*q,charged_value:charged,
        charged_unit_price:charged/q,branch_profit_value:charged-dp*q,
        receipt_no:sale.sale_number || sale.id,business_date:businessDay(new Date(sale.sale_date)),
        timezone:'Africa/Windhoek',sale_reference:sale.id,provenance:'reconstructed_exact_source'};
      const original=m.metadata?.sale_evidence || {},patch={};
      for(const [key,value] of Object.entries(candidate))if(original[key]==null && value!=null)patch[key]=value;
      if(['dp_unit_price','dp_value','charged_unit_price','charged_value','branch_profit_value']
        .some(k=>original[k]!=null && (!Number.isFinite(Number(original[k])) ||
          Math.abs(Number(original[k])-Number(candidate[k]))>1e-8))){
        reason='Existing nonblank evidence conflicts; manual review required';break;
      }
      lines.push({movementId:m.id,mirrorId:a?.snapshot?.branch_movement_id || null,
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
    if(lines.some(l=>Object.keys(l.patch).length) || !audit)
      eligible.push({reference:sale.id,lines,audit:audit?null:details});
  }
  // Legacy prescriptions have no exact completion-to-BAT identity. Never group
  // distinct partial issues by report name/time; they require operator review.
  for(const m of movements.filter(m=>!sales.some(s=>s.id===m.reference_id)))
    review.push({reference:m.reference_id,movement:m.id,reason:'No exact completed receipt/session source; review prescription/legacy evidence'});
  const plan={eligible,review};
  return {...plan,fingerprint:hash({sales,movements,allocations,audits}),planHash:hash(plan)};
}

export async function readSaleRepairPlan(client,{reference,branch,from,to,limit=500}) {
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
  const plan=planSaleEvidenceRepair({sales,movements,allocations,audits});
  if(reference && !sales.length && !movements.length) {
    plan.review.push({reference,reason:'No exact completed receipt or source-linked movement found'});
    plan.planHash=hash({eligible:plan.eligible,review:plan.review});
  }
  return plan;
}

export async function applySaleRepairPlanTx(client,plan) {
  const refs=plan.eligible.map(s=>s.reference);
  const invariant=async()=>hash((await client.query(`SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_array(id,quantity,unit_cif,unit_dp) ORDER BY id),'[]'::jsonb)
      FROM stock_movements WHERE reference_id=ANY($1)) AS movement_values,
    (SELECT COALESCE(jsonb_agg(jsonb_build_array(movement_id,quantity) ORDER BY movement_id),'[]'::jsonb)
      FROM stock_sale_allocations WHERE sale_reference=ANY($1)) AS allocation_quantities,
    (SELECT COALESCE(jsonb_agg(to_jsonb(s)-'metadata' ORDER BY id),'[]'::jsonb)
      FROM branch_walkin_sales s WHERE id=ANY($1)) AS receipt_values`,[refs])).rows);
  const before=await invariant();
  for(const sale of plan.eligible){
    for(const line of sale.lines) {
      if(line.allocationPatch)await client.query(`UPDATE stock_sale_allocations SET snapshot=$1::jsonb || jsonb_strip_nulls(snapshot)
        WHERE movement_id=$2`,[JSON.stringify(line.allocationPatch),line.movementId]);
      for(const [table,id] of [['stock_movements',line.movementId],['branch_inventory_movements',line.mirrorId]]){
        if(!id)continue;
        // Each original field wins, including a valid zero. Never replace any
        // original nonblank evidence, even if the planner proposed a patch.
        await client.query(`UPDATE ${table} SET metadata=COALESCE(metadata,'{}'::jsonb) ||
          jsonb_build_object('sale_evidence',$1::jsonb || jsonb_strip_nulls(COALESCE(metadata->'sale_evidence','{}'::jsonb)))
          WHERE id=$2`,[JSON.stringify(line.patch),id]);
      }
    }
    if(sale.audit)await client.query(`INSERT INTO mis_sales_audit(event_type,record_id,user_name,details,created_at,source_key)
      VALUES('sale_created',$1,$2,$3,$4,$5) ON CONFLICT(source_key) DO NOTHING`,
    [sale.reference,sale.audit.staff,JSON.stringify(sale.audit),sale.audit.timestamp,`walkin:${sale.reference}`]);
  }
  if(await invariant()!==before)throw Error('Repair invariant failed: quantities or financial values changed');
  return {invariantBefore:before,invariantAfter:before,quantitiesAndPostingsUnchanged:true};
}
