// Passive forwarding observer: no result, SQL text or parameter is transformed;
// the same real driver is always called and the API is never mocked.
import './owned-raw-database.js';
import {subscribe,unsubscribe} from 'node:diagnostics_channel';
import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {expect,afterAll} from 'vitest';
import pg from 'pg';
const digest=x=>createHash('sha256').update(x).digest('hex');
const admitted=new Map(),succeeded=new Set();
const caseKey=()=>digest((expect.getState().testPath||'owned')+'\n'+(expect.getState().currentTestName||'setup'));
function observe(event){
  if(!/^[a-f0-9]{64}$/.test(event.sqlFingerprint)||typeof event.queryId!=='string')return;
  const key=caseKey()+':'+event.sqlFingerprint;
  if(!admitted.has(key))admitted.set(key,new Set());
  admitted.get(key).add(event.queryId);
}
subscribe('dynapharm.sql-boundary.admitted',observe);
const original=pg.Client.prototype.query;
pg.Client.prototype.query=function(...args){
  const text=typeof args[0]==='string'?args[0]:null;
  const key=text?caseKey()+':'+digest(text):null;
  // pg.Pool forwards through Client using callback form. Observe that form as
  // well as promises; otherwise all real pool-backed HTTP reads go unwitnessed.
  const last=args.length-1,callback=args[last];
  if(key&&typeof callback==='function')args[last]=function(...callbackArgs){
    if(!callbackArgs[0])succeeded.add(key);
    return callback.apply(this,callbackArgs);
  };
  const result=original.apply(this,args);
  if(key&&result&&typeof result.then==='function')
    result.then(()=>succeeded.add(key),()=>{});
  return result;
};
afterAll(()=>{
  unsubscribe('dynapharm.sql-boundary.admitted',observe);
  pg.Client.prototype.query=original;
  const rows=[...admitted].map(([key,ids])=>({caseHash:key.slice(0,64),
    sqlFingerprint:key.slice(65),queryIds:[...ids].sort(),nativeSucceeded:succeeded.has(key)}));
  appendFileSync(process.env.OWNED_AUDIT_OUTPUT+'/runtime-query-coverage.jsonl',
    JSON.stringify({schema:1,production:false,parameterValuesRecorded:false,sqlTextRecorded:false,rows})+'\n',{mode:0o600});
});
