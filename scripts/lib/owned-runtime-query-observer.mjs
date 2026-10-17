import {ownedToolContext} from './owned-tool-context.mjs';
import pg from 'pg';
import {subscribe} from 'node:diagnostics_channel';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {Server} from 'node:http';
const scope=new AsyncLocalStorage(),admitted=new Map(),succeeded=new Set();let sequence=0;
const digest=x=>createHash('sha256').update(x).digest('hex');
const emit=Server.prototype.emit;
Server.prototype.emit=function(name,...args){
  if(name==='request')return scope.run(++sequence,()=>emit.call(this,name,...args));
  return emit.call(this,name,...args);
};
subscribe('dynapharm.sql-boundary.admitted',e=>{
  if(e.operation==='control'||typeof e.queryId!=='string')return;
  const key=(scope.getStore()||0)+':'+e.sqlFingerprint;
  if(!admitted.has(key))admitted.set(key,new Set());
  admitted.get(key).add(e.queryId);
});
const query=pg.Client.prototype.query;
pg.Client.prototype.query=function(...args){
  const key=typeof args[0]==='string'?(scope.getStore()||0)+':'+digest(args[0]):null;
  const last=args.length-1,callback=args[last];
  if(key&&typeof callback==='function')args[last]=function(...values){
    if(!values[0])succeeded.add(key);
    return callback.apply(this,values);
  };
  const result=query.apply(this,args);
  if(key&&result&&typeof result.then==='function')result.then(()=>succeeded.add(key),()=>{});
  return result;
};
function flush(){
  const output=process.env.OWNED_AUDIT_OUTPUT;
  mkdirSync(output,{recursive:true,mode:0o700});
  writeFileSync(output+'/runtime-http-query-coverage.json',JSON.stringify({
    runId:ownedToolContext.runId,production:false,sqlTextRecorded:false,parameterValuesRecorded:false,
    rows:[...admitted].map(([key,ids])=>({requestSequence:Number(key.split(':')[0]),
      sqlFingerprint:key.slice(key.indexOf(':')+1),queryIds:[...ids],nativeSucceeded:succeeded.has(key)}))
  },null,2),{mode:0o600});
}
process.on('SIGTERM',flush);process.on('beforeExit',flush);
