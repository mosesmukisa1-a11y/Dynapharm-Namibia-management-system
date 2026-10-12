import {randomUUID} from 'node:crypto';
import {getOne,getMany,query,insert} from './db.js';
import {atomicStockRequest} from './_lib/atomicStockRequest.js';
import {historyAccess,deny} from './services/clientHistoryAccess.js';

function text(value,max=10000){return String(value||'').trim().slice(0,max);}
function date(value){
  if(!value||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value))||Date.parse(value)>Date.now()+60000)
    deny('A valid past service date/time with timezone is required',400);
  return new Date(value).toISOString();
}
async function cleanData(data,clientId){
  if(!data||!text(data.originalAuthor)||!text(data.originalFormReference))
    deny('Recorded prescriber and original form reference are required',400);
  const medicines=Array.isArray(data.medicines)?data.medicines.map(m=>({
    name:text(m.name,255),unit:text(m.unit,50)||'unit',quantity:Number(m.quantity),
    directions:text(m.directions,1000),alreadyDispensed:Number(m.alreadyDispensed||0)
  })):[];
  const names=new Set();
  if(!medicines.length)deny('Transcribe at least one prescribed item',400);
  for(const m of medicines){
    const key=m.name.toLowerCase();
    if(!m.name||names.has(key)||!Number.isSafeInteger(m.quantity)||m.quantity<=0||
      !Number.isSafeInteger(m.alreadyDispensed)||m.alreadyDispensed<0||m.alreadyDispensed>m.quantity)
      deny('Items require unique names, positive whole quantities and dispensed quantities between zero and prescribed',400);
    names.add(key);
  }
  const attachments=[];
  for(const item of Array.isArray(data.attachments)?data.attachments:[]){
    const a=await getOne('SELECT id,name FROM client_history_attachments WHERE id=$1 AND client_id=$2',[item.id,clientId]);
    if(!a)deny('Attachment does not belong to this client',400);
    attachments.push(a);
  }
  return {offSystemHistorical:true,location:text(data.location,300),originalAuthor:text(data.originalAuthor,200),
    originalFormReference:text(data.originalFormReference,255),notes:text(data.notes),medicines,attachments};
}
async function audit(e,actor,action){
  await insert('client_history_events',{id:randomUUID(),encounter_id:e.id,actor,action,snapshot:JSON.stringify(e)});
}
async function handler(req,res){
 try{
  if(!req.user)deny('Authentication required',401);
  const actor=String(req.user.sub||req.user.id||'');
  if(!actor)deny('Session actor is required',401);
  const body=req.body||{},params=new URL(req.url,'http://local').searchParams;
  const clientId=req.method==='GET'?params.get('clientId'):body.clientId;
  if(!['frontdesk','consultant'].includes(req.user.role))deny('Client history access denied');
  const client=await getOne('SELECT * FROM clients WHERE id=$1',[clientId]);
  if(!client)deny('Client not found',404);
  historyAccess(req.user,client.branch);
  if(req.method==='GET'){
    const rows=await getMany('SELECT * FROM client_encounters WHERE client_id=$1 ORDER BY service_at DESC,captured_at DESC',[clientId]);
    const encounters=[];
    for(const e of rows){
      historyAccess(req.user,e.branch);
      encounters.push({...e,quantities:(e.data.medicines||[]).map(m=>({...m,
        dispensed:Number(m.alreadyDispensed||0),outstanding:Math.max(0,Number(m.quantity)-Number(m.alreadyDispensed||0))})),
        evidence:await getMany('SELECT * FROM client_dispense_evidence WHERE encounter_id=$1 ORDER BY captured_at',[e.id]),
        history:await getMany('SELECT * FROM client_history_events WHERE encounter_id=$1 ORDER BY created_at',[e.id])});
    }
    return res.json({client,encounters,appointments:[],reports:[]});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(req.user.role!=='frontdesk')deny('Only Front Desk may file or amend an off-system form');
  // Check before replay: old operation responses must never re-enable removed actions.
  if(!['create','amend'].includes(body.action))deny('Only off-system form filing and amendments are supported',400);
  if(!body.operationId||! /^[\w-]{8,100}$/.test(body.operationId))deny('A stable operation ID is required',400);
  await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`history:${body.operationId}`]);
  const previous=await getOne('SELECT * FROM client_history_operations WHERE id=$1',[body.operationId]);
  if(previous){
    const same=await getOne('SELECT request=$2::jsonb AS same FROM client_history_operations WHERE id=$1',[body.operationId,JSON.stringify(body)]);
    if(previous.actor!==actor||!same.same)deny('Operation ID already used with different content',409);
    return res.json(previous.response);
  }
  if(!['outreach','paper','outage'].includes(body.source))deny('Select an off-system source',400);
  const serviceAt=date(body.serviceAt),data=await cleanData(body.data,client.id);
  let e;
  if(body.action==='create'){
    e=await insert('client_encounters',{id:randomUUID(),client_id:client.id,branch:client.branch,
      service_at:serviceAt,source:body.source,responsible_consultant:data.originalAuthor,captured_by:actor,
      status:'draft',data:JSON.stringify(data)});
    await audit(e,actor,'off-system form filed (not electronic approval)');
  }else{
    e=await getOne('SELECT * FROM client_encounters WHERE id=$1 AND client_id=$2 FOR UPDATE',[body.encounterId,client.id]);
    if(!e)deny('Record not found',404);
    historyAccess(req.user,e.branch);
    if(!e.data.offSystemHistorical||e.report_id)deny('Earlier evidence is read-only; it will not be rewritten',409);
    if(body.version!==e.version)deny('Record changed; reload before retrying',409);
    if(!text(body.reason))deny('An amendment reason is required',400);
    await audit(e,actor,`original before amendment: ${text(body.reason,1000)}`);
    e=await getOne(`UPDATE client_encounters SET service_at=$2,source=$3,responsible_consultant=$4,
      data=$5,version=version+1 WHERE id=$1 RETURNING *`,[e.id,serviceAt,body.source,data.originalAuthor,JSON.stringify(data)]);
    await audit(e,actor,`off-system amendment: ${text(body.reason,1000)}`);
  }
  const response={success:true,encounter:e};
  await insert('client_history_operations',{id:body.operationId,actor,request:JSON.stringify(body),response:JSON.stringify(response)});
  return res.json(response);
 }catch(error){
  return res.status(error.statusCode||500).json({success:false,error:error.statusCode?error.message:'Off-system form could not be saved; no changes were committed.'});
 }
}
export default atomicStockRequest(handler);
