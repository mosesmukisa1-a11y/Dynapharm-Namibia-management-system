import {createHash} from 'node:crypto';
export const SAFE_STOCK_GETS=Object.freeze([
 '/api/health','/api/version','/api/prices','/api/stock/valuation',
 '/api/branch/inventory?branch=townshop','/api/stock/branch-batches','/api/stock-movements',
 '/api/gm/daily-sales?date=2026-10-15','/api/stock/trace?search=OWNED-EMPTY','/api/stock-batches',
 '/api/gm/summary','/api/finance/summary','/api/director/summary','/api/stock/current-overview','/api/stock/ai-reorder',
 '/branch','/finance','/gm','/director','/mis',
 '/stock?view=aiDashboard','/stock?view=branchStock','/stock?view=inventory','/stock?view=batch',
 '/stock?view=stockReports','/stock?view=costReport','/stock?view=valuation','/stock?view=reorder',
 '/stock?view=barcode','/stock?view=trace',
]);
export const smokeManifestHash=createHash('sha256').update(JSON.stringify(SAFE_STOCK_GETS)).digest('hex');
export async function safeGet({origin,path,cookie,fetcher=fetch,log=()=>{}}){
 if(!SAFE_STOCK_GETS.includes(path))throw Error('GET is outside frozen production smoke allowlist');
 const base=new URL(origin);
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Invalid smoke origin');
 const url=new URL(path,base),start=Date.now();
 const response=await fetcher(url,{method:'GET',redirect:'manual',headers:cookie?{cookie}:{},signal:AbortSignal.timeout(10000)});
 const entry={method:'GET',path,status:response.status,durationMs:Date.now()-start,at:new Date().toISOString()};
 log(entry);
 if(response.redirected||(response.status>=300&&response.status<400))throw Error('Smoke redirect refused: '+path);
 if(response.status!==200)throw Error('Smoke response '+response.status+': '+path);
 await response.arrayBuffer();return entry;
}
export async function runSafeStockSmoke(options){
 const results=[];
 for(const path of SAFE_STOCK_GETS)results.push(await safeGet({...options,path}));
 return {manifestHash:smokeManifestHash,results};
}
