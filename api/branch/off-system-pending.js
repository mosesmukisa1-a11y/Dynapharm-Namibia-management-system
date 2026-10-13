import {randomUUID} from 'node:crypto';
import {getOne,getMany,query,insert} from '../db.js';
import {atomicStockRequest} from '../_lib/atomicStockRequest.js';
import {branchSearchTerms} from '../_lib/branchUtils.js';
import {authorizePending,pendingForm} from '../services/offSystemFulfilment.js';
import {deny} from '../services/clientHistoryAccess.js';
import dispense,{OFF_SYSTEM_ISSUE} from './dispense.js';

async function handler(req,res){
 try{
  const body=req.body||{},params=new URL(req.url,'http://local').searchParams;
  if(req.method==='GET'){
    const branch=params.get('branch');authorizePending(req.user,branch);
    const rows=await getMany(`SELECT * FROM client_encounters WHERE branch=ANY($1::text[])
      AND data->>'offSystemHistorical'='true' ORDER BY service_at DESC`,[branchSearchTerms(branch)]);
    return res.json({forms:await Promise.all(rows.map(pendingForm))});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!req.user)deny('Authentication required',401);
  const initial=await getOne('SELECT branch FROM client_encounters WHERE id=$1',[body.encounterId]);
  if(!initial)deny('Form not found',404);
  authorizePending(req.user,initial.branch);
  const actor=String(req.user.sub||req.user.id||'');
  if(!actor)deny('Session actor required',401);
  if(!/^[\w-]{8,100}$/.test(body.operationId||''))deny('Stable operation ID required',400);
  const operation=`pending:${body.operationId}`;
  await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operation]);
  const old=await getOne('SELECT *,request=$2::jsonb AS same FROM client_history_operations WHERE id=$1',[operation,JSON.stringify(body)]);
  if(old){
    if(old.actor!==actor||!old.same)deny('Retry key belongs to a different request',409);
    return res.json(old.response);
  }
  const e=await getOne('SELECT * FROM client_encounters WHERE id=$1 FOR UPDATE',[body.encounterId]);
  authorizePending(req.user,e.branch);
  if(!e.data.offSystemHistorical)deny('Not an off-system form',409);
  if(e.version!==body.version)deny('Form changed; reload before dispensing',409);
  if(body.paymentConfirmed!==true||body.physicalConfirmed!==true||!['cash','card','eft'].includes(body.paymentMethod))
    deny('Confirm payment received and choose cash, card or EFT',400);
  const form=await pendingForm(e),items=[],seen=new Set();
  if(!Array.isArray(body.items)||!body.items.length)deny('Select pending medicines',400);
  let total=0;
  for(const item of body.items){
    const p=form.quantities.find(p=>p.name===item.name),quantity=Number(item.quantity);
    if(!p||seen.has(item.name)||!Number.isSafeInteger(quantity)||quantity<=0)deny('Invalid or duplicate medicine quantity',400);
    if(p.issueError)deny(p.issueError,409);
    if(quantity>p.outstanding)deny('Quantity exceeds pending medicines',409);
    seen.add(p.name);items.push({name:p.name,quantity,unitPrice:p.unitPrice});
    total+=p.unitPrice*quantity;
  }
  total=Math.round(total*100)/100;
  if(Number(body.expectedTotal)!==total)deny('Price changed; reload and confirm the current total',409);
  const reference=`OFF-RX-${randomUUID()}`;
  await insert('reports',{id:reference,client_id:e.client_id,branch:e.branch,consultant:e.responsible_consultant,
    report_type:'prescription',data:JSON.stringify({offSystemFulfilment:true,encounterId:e.id,clientId:e.client_id,
      branch:e.branch,medicines:items,originalFormReference:e.data.originalFormReference})});
  let status=200,result;
  await dispense({method:'POST',url:'/api/branch/dispense',headers:req.headers||{},user:req.user,[OFF_SYSTEM_ISSUE]:true,
    body:{reportId:reference,branchId:e.branch,createdBy:actor,customerType:form.customerType,nbNumber:form.nbNumber,
      patientName:form.client_name,paymentMethod:body.paymentMethod,items:items.map(i=>({product_name:i.name,quantity:i.quantity}))}},
    {setHeader(){},getHeader(){},status(s){status=s;return this;},json(b){result=b;return this;},end(){}});
  if(status>=400||!result?.success)deny(result?.error||'Dispensing failed',status>=400?status:409);
  // Existing legacy handler logs some posting errors. This new flow must never
  // commit stock without its matching payment, even if a legacy catch swallowed it.
  const payment=await getOne(`SELECT SUM(grand_total)::numeric total FROM branch_activity_transactions
    WHERE form_reference_id=$1 AND activity_type='prescription_dispensing'`,[reference]);
  if(payment?.total==null||Number(payment.total)!==total)deny('Payment posting did not match the issue; no changes saved',409);
  await insert('client_dispense_evidence',{id:randomUUID(),encounter_id:e.id,report_id:reference,mode:'live',
    service_at:new Date().toISOString(),captured_by:actor,source_reference:reference,items:JSON.stringify(items),
    data:JSON.stringify({paymentMethod:body.paymentMethod,total,paymentReceived:true})});
  const updated=await getOne('UPDATE client_encounters SET version=version+1 WHERE id=$1 RETURNING *',[e.id]);
  await insert('client_history_events',{id:randomUUID(),encounter_id:e.id,actor,action:'Pending medicines collected and paid',
    snapshot:JSON.stringify({encounter:updated,receipt:{reference,total,items,paymentMethod:body.paymentMethod}})});
  const response={success:true,encounter:updated,receipt:{reference,total,items,paymentMethod:body.paymentMethod}};
  await insert('client_history_operations',{id:operation,actor,request:JSON.stringify(body),response:JSON.stringify(response)});
  return res.json(response);
 }catch(error){return res.status(error.statusCode||500).json({success:false,error:error.statusCode?error.message:'Dispensing failed; no changes were saved'});}
}
export default atomicStockRequest(handler);
