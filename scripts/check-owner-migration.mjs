import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='generated-artifacts/owner-approval-package';
if(process.env.NODE_ENV==='production'||['1','true'].includes(process.env.REPLIT_DEPLOYMENT))throw Error('Development only');
const source=new URL(process.env.DATABASE_URL);
if(!['helium','localhost','127.0.0.1','[::1]'].includes(source.hostname))throw Error('Local owned databases only');
const adminUrl=new URL(source);adminUrl.pathname='/postgres';
const admin=new pg.Pool({connectionString:adminUrl.toString(),max:1});
const sql=await readFile('migrations/035_manual_price_control.sql','utf8');
const report={status:'RUNNING',migration:'035',sha256:createHash('sha256').update(sql).digest('hex'),cases:[]};
const cleanups=[];
await mkdir(base,{recursive:true});
try{
  for(const populated of [false,true]){
    const name='stock_audit_'+randomUUID().replaceAll('-','');
    const url=new URL(source);url.pathname='/'+name;
    await admin.query(`CREATE DATABASE ${name}`);
    const db=new pg.Client({connectionString:url.toString()});
    const evidence={database:name,populated,applications:[],cleanup:'PENDING'};report.cases.push(evidence);
    try{
      await db.connect();
      assert.equal((await db.query('SELECT current_database() name')).rows[0].name,name);
      // Only prerequisite pricebook DDL in a genuinely fresh disposable database.
      await db.query(await readFile('migrations/027_price_import_identity.sql','utf8'));
      if(populated)await db.query(`INSERT INTO product_prices(description,dp,cp,cif,bv,updated_by)
        SELECT 'SYNTHETIC-PRICE-'||n,n,n+10,2,0,'isolated migration fixture' FROM generate_series(1,250) n;
        INSERT INTO product_price_history(product_id,description,old_dp,new_dp,changed_by,status)
        SELECT id,description,dp,dp+1,'isolated migration fixture','pending' FROM product_prices`);
      const fingerprint=async()=> (await db.query(`SELECT md5(string_agg(j::text,'' ORDER BY j::text)) hash FROM
        (SELECT to_jsonb(p) j FROM product_prices p UNION ALL SELECT to_jsonb(h) FROM product_price_history h) x`)).rows[0].hash;
      const before=await fingerprint();
      // Transactional rollback leaves no partial new object.
      await db.query('BEGIN');await db.query(sql);await db.query('ROLLBACK');
      assert.equal((await db.query("SELECT to_regclass('public.manual_price_actions') name")).rows[0].name,null);
      evidence.rollback='PASS';
      for(let run=1;run<=2;run++){
        const started=performance.now();
        await db.query("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'");
        await db.query(sql);await db.query('COMMIT');
        evidence.applications.push({run,elapsedMs:Math.round((performance.now()-started)*100)/100});
      }
      assert.equal(await fingerprint(),before);
      evidence.originalPricebookUnchanged=true;
      evidence.columns=(await db.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='manual_price_actions' ORDER BY ordinal_position`)).rows;
      evidence.constraints=(await db.query(`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
        WHERE conrelid='manual_price_actions'::regclass ORDER BY conname`)).rows;
      evidence.indexes=(await db.query(`SELECT indexname,indexdef FROM pg_indexes WHERE tablename='manual_price_actions' ORDER BY indexname`)).rows;
      assert.equal(evidence.columns.length,12);
      assert.equal(evidence.constraints.filter(c=>c.definition.startsWith('FOREIGN KEY')).length,2);
      evidence.status='PASS';
    }finally{
      await db.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      evidence.cleanup=(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount===0?'PASS':'FAIL';
      cleanups.push(evidence.cleanup);
    }
  }
  assert(cleanups.every(s=>s==='PASS'));report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted database URI]');process.exitCode=1;}
finally{
  await admin.end();await writeFile(base+'/migration-035-isolated.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({status:report.status,cases:report.cases.map(c=>({populated:c.populated,status:c.status,cleanup:c.cleanup})),error:report.error}));
