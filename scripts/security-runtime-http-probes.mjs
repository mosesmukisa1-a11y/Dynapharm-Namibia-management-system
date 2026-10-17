// Fresh actual-server tests. This module cannot load outside its owned cluster.
import {ownedToolContext} from './lib/owned-tool-context.mjs';
import pg from 'pg';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=x=>createHash('sha256').update(x).digest('hex');
process.once('message',async({baseUrl,material,markers})=>{
  const out=path.dirname(path.resolve(process.env.OWNED_AUDIT_OUTPUT));
  const steps=[];let db,stage='initialization',lastAction=null,failed=false,completed=false;
  const report=async()=>fs.writeFile(out+'/runtime-http-results.json',JSON.stringify({
    status:failed?'FAIL':completed?'PASS':'RUNNING',runId:ownedToolContext.runId,stage,steps,
    actualStaffSessions:true,production:false,providerCalls:0,
    credentialsRecorded:false,canaryValuesRecorded:false},null,2));
  try{
    if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl))throw Error('LOOPBACK_REQUIRED');
    db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:false});await db.connect();
    const identity=await db.query('SELECT current_database() AS name');
    if(identity.rows[0].name!==ownedToolContext.database)throw Error('TARGET_MISMATCH');
    const fixtureColumns=await db.query(`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position`,
      [['products','warehouse_locations','stock_batches','mis_drafts']]);
    await fs.writeFile(out+'/runtime-fixture-columns.json',JSON.stringify({
      production:false,applicationRowsRead:false,columns:fixtureColumns.rows},null,2));
    async function call(method,path,body,cookie,expected){
      lastAction={method,endpoint:path};
      const r=await fetch(baseUrl+path,{method,redirect:'error',headers:{
        origin:baseUrl,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=null;}
      const leaked=markers.some(m=>text.includes(m));
      steps.push({stage,...lastAction,status:r.status,expected,bodySha256:hash(text),
        markerLeaked:leaked,result:r.status===expected&&!leaked?'PASS':'FAIL'});
      await report();
      if(r.status!==expected||leaked)throw Error('HTTP_CONTRACT_FAILED');
      return {value,cookie:(r.headers.getSetCookie?.()||[r.headers.get('set-cookie')]).filter(Boolean)
        .map(c=>c.split(';')[0]).join('; ')};
    }
    stage='actual administrator login';
    const admin=(await call('POST','/api/auth/login',{username:'closure-admin',password:material.password},null,200)).cookie;
    stage='actual GM login';
    const gm=(await call('POST','/api/auth/login',{username:'closure-gm',password:material.password},null,200)).cookie;
    const snapshot=async()=>{const r=await db.query(`SELECT
      (SELECT COALESCE(SUM(remaining_quantity),0) FROM stock_batches)::text AS warehouse,
      (SELECT COUNT(*) FROM branch_inventory_batches)::text AS branchRows`);
      return r.rows[0];};
    stage='owned fixture provisioning';lastAction={method:'SQL',endpoint:'owned-loopback/fixture-provisioning'};
    await db.query("INSERT INTO products(id,name) VALUES('SQL-RUNTIME-PRODUCT','Synthetic runtime reference')");
    await db.query("INSERT INTO warehouse_locations(id,name) VALUES('SQL-RUNTIME-WH','Synthetic runtime warehouse')");
    await db.query(`INSERT INTO stock_batches(id,description,location,batch_no,quantity,remaining_quantity)
      VALUES('SQL-RUNTIME-BATCH','Synthetic runtime reference','SQL-RUNTIME-WH','SQL-RUNTIME-BATCH',0,0)`);
    const before=await snapshot();
    stage='agreement native hostile-bound insertion and filtered read';
    const injected="SYNTHETIC_SQL_VALUE_' ; SELECT 1 --";
    const registration=await call('POST','/api/distributor-agreement',{
      first_name:'Synthetic',last_name:injected,contact_mobile:'0000000000',
      processing_branch:'townshop',kit_type:'supplements',immediate_issue:false},admin,201);
    const agreementId=registration.value?.agreement_id;
    if(!agreementId)throw Error('AGREEMENT_ID_MISSING');
    await call('GET','/api/distributor-agreement?branch='+encodeURIComponent('townshop')+'&status=pending_payment',null,admin,200);
    await call('GET','/api/distributor-agreement?id='+encodeURIComponent(agreementId),null,admin,200);
    stage='MIS native draft header and line persistence with session actor';
    const draftId='SQL-RUNTIME-DRAFT';
    await call('POST','/api/mis/drafts',{user:{id:'SPOOFED-ACTOR',fullName:'Spoofed Actor',username:'spoofed-actor'},
      draft:{id:draftId,branch:'townshop',status:'draft',metadata:{synthetic:true},
        lines:[{tempId:'SQL-RUNTIME-LINE',sku:'',productName:injected,quantity:1,unitPrice:2,
          branch:'townshop',distributorName:'Synthetic reference only'}]}},admin,200);
    const draft=await call('GET','/api/mis/drafts?id='+draftId,null,admin,200);
    const nativeDraft=await db.query("SELECT created_by,updated_by FROM mis_sales_drafts WHERE id=$1",[draftId]);
    const actor=nativeDraft.rows[0]?.created_by;
    const actorMatches=['Synthetic closure account','closure-admin'].includes(actor)&&
      nativeDraft.rows[0]?.updated_by===actor;
    steps.push({stage,result:actorMatches?'PASS':'FAIL',sessionActorRetained:actorMatches,
      spoofedBodyActorRejected:actor!=='Spoofed Actor'&&nativeDraft.rows[0]?.updated_by!=='spoofed-actor',draftReloaded:!!draft.value?.draft});
    if(!actorMatches)throw Error('SESSION_ACTOR_MISMATCH');
    stage='legacy GM approved descriptor field update';
    const adjustment=await call('POST','/api/stock-adjustments',{
      target_type:'warehouse',target_id:'SQL-RUNTIME-BATCH',product_name:'Synthetic runtime reference',
      location:'SQL-RUNTIME-WH',field_to_adjust:'notes',old_value:'',new_value:injected,
      reason:'Synthetic SQL boundary verification'},gm,201);
    const adjustmentId=adjustment.value?.id||adjustment.value?.adjustment?.id;
    if(!adjustmentId)throw Error('ADJUSTMENT_ID_MISSING');
    await call('PATCH','/api/stock-adjustments/'+encodeURIComponent(adjustmentId)+'/approve',{},gm,200);
    await call('PATCH','/api/stock-adjustments/'+encodeURIComponent(adjustmentId)+'/approve',{},gm,200);
    stage='native original-table PostgreSQL failure and same-server recovery';
    await call('GET','/api/client-history?clientId=CLOSURE-OWN-CLIENT',null,admin,200);
    const columns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' ORDER BY ordinal_position");
    const names=columns.rows.map(r=>r.column_name);
    if(!names.includes('full_name')||names.some(n=>!/^[a-z_][a-z0-9_]*$/i.test(n)))throw Error('FIXTURE_COLUMNS_INVALID');
    await db.query('CREATE TABLE owned_runtime_failure_marker(value text NOT NULL)');
    await db.query('INSERT INTO owned_runtime_failure_marker(value) VALUES($1)',[markers[1]]);
    await db.query(`CREATE FUNCTION owned_runtime_failure() RETURNS text LANGUAGE plpgsql AS $f$
      DECLARE marker text; BEGIN SELECT value INTO marker FROM owned_runtime_failure_marker;
      RAISE EXCEPTION '%',marker; END $f$`);
    await db.query('ALTER TABLE clients RENAME TO owned_runtime_clients');
    await db.query('CREATE VIEW clients AS SELECT '+names.map(n=>n==='full_name'?
      'owned_runtime_failure() AS full_name':'"'+n+'"').join(',')+' FROM owned_runtime_clients');
    await call('GET','/api/client-history?clientId=CLOSURE-OWN-CLIENT',null,admin,500);
    await call('GET','/api/health',null,null,200);
    await db.query('DROP VIEW clients');
    await db.query('ALTER TABLE owned_runtime_clients RENAME TO clients');
    await call('GET','/api/client-history?clientId=CLOSURE-OWN-CLIENT',null,admin,200);
    const after=await snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after);
    steps.push({stage:'stock sentinel',before,after,result:unchanged?'PASS':'FAIL'});
    if(!unchanged)throw Error('STOCK_SENTINEL_CHANGED');
    completed=true;
  }catch(error){
    failed=true;steps.push({stage,...lastAction,result:'FAIL',
      errorClass:/^[A-Z_]+$/.test(error.message||'')?error.message:'OWNED_NATIVE_PROBE_FAILED',
      databaseColumn:typeof error.column==='string'&&/^[a-z_][a-z0-9_]*$/i.test(error.column)?error.column:
        (error.message?.match(/column "([a-z_][a-z0-9_]*)"/i)?.[1]||null),
      databaseCode:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:null});
  }finally{
    await db?.end().catch(()=>{});await report();process.exit(failed?1:0);
  }
});
