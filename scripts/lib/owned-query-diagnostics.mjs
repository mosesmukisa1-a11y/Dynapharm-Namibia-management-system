// Opt-in diagnostics for owned synthetic fixtures only. Never save SQL or values.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const file=process.env.OWNED_QUERY_DIAGNOSTICS;
if(file){
  const roots=['security-release-candidate-final','security-release-gate-final','final-security-release-gate','sql-security-final-closure','sql-runtime-enforcement-final']
    .map(name=>fileURLToPath(new URL('../../generated-artifacts/'+name+'/fixture-runs/',import.meta.url)));
  if(process.env.STOCK_AUDIT_ISOLATED!=='1'||process.env.NODE_ENV!=='test'||
    !roots.some(root=>path.resolve(file).startsWith(root))||process.env.REPLIT_DEPLOYMENT!=='0')
    throw Error('Owned query diagnostic scope refused');
  const original=pg.Client.prototype.query;
  pg.Client.prototype.query=function(...args){
    const recordError=error=>{
      const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
      const target=sql?.match(/\b(?:INTO|UPDATE|FROM|TABLE)\s+([a-z_][a-z0-9_]*)/i)?.[1]||null;
      const missingObject=['42P01','42703'].includes(error.code)
        ?error.message?.match(/^(?:relation|column) "([a-z_][a-z0-9_.]*)" does not exist$/i)?.[1]||null:null;
      const task=globalThis.__vitest_worker__?.current;
      fs.appendFileSync(file,JSON.stringify({code:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:'QUERY_FAILED',
        suite:process.env.OWNED_QUERY_SUITE||null,testName:task?.type==='test'?task.name:null,
        target,missingObject,sqlSha256:sql?createHash('sha256').update(sql).digest('hex'):null,
        businessRowsSaved:false,valuesSaved:false})+'\n');
    };
    const callback=args.at(-1);
    if(typeof callback==='function'){
      args[args.length-1]=function(error,...rest){
        if(error)recordError(error);return callback.call(this,error,...rest);
      };
    }
    const result=original.apply(this,args);
    return result?.catch?result.catch(error=>{recordError(error);throw error;}):result;
  };
}
