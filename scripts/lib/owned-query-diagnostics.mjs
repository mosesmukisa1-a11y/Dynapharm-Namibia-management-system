// Opt-in diagnostics for owned synthetic fixtures only. Never save SQL or values.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const file=process.env.OWNED_QUERY_DIAGNOSTICS;
if(file){
  const root=path.resolve('generated-artifacts/security-release-candidate-final/fixture-runs')+path.sep;
  if(process.env.STOCK_AUDIT_ISOLATED!=='1'||process.env.NODE_ENV!=='test'||
    !path.resolve(file).startsWith(root)||process.env.REPLIT_DEPLOYMENT!=='0')
    throw Error('Owned query diagnostic scope refused');
  const original=pg.Client.prototype.query;
  pg.Client.prototype.query=function(...args){
    const result=original.apply(this,args);
    if(!result?.catch)return result;
    return result.catch(error=>{
      const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
      const target=sql?.match(/\b(?:INTO|UPDATE|FROM|TABLE)\s+([a-z_][a-z0-9_]*)/i)?.[1]||null;
      const missingObject=['42P01','42703'].includes(error.code)
        ?error.message?.match(/^(?:relation|column) "([a-z_][a-z0-9_.]*)" does not exist$/i)?.[1]||null:null;
      fs.appendFileSync(file,JSON.stringify({code:/^[A-Z0-9]{5}$/.test(error.code||'')?error.code:'QUERY_FAILED',
        target,missingObject,sqlSha256:sql?createHash('sha256').update(sql).digest('hex'):null,
        businessRowsSaved:false,valuesSaved:false})+'\n');
      throw error;
    });
  };
}
