// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
const source=readFileSync('client/src/pages/portals/StockPortal.jsx','utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
const report=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='StockReportsTab');
const callback=report.body.body.flatMap(n=>n.declarations||[]).find(n=>n.id.name==='loadData').init.arguments[0];
const functionText=source.slice(callback.start,callback.end);
const pending=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
const flush=()=>new Promise(setImmediate);
function setup(){
 const epoch={current:0},data=[],errors=[],loading=[],notices=[];
 const queue=[pending(),pending()];let i=0;
 const api={branch:{stockSummary:()=>queue[i++].promise},stock:{batches:async()=>[],movements:async()=>[]},
   mis:{stockReport:async()=>({success:true})},get:async()=>({summary:{total:10}})};
 const factory=new Function('api','period','reportEpoch','setLoading','setReportError','setBranchData',
   'setBatches','setMisReport','setReportNotices','setRetrievedAt','setMovements','setCompanySnapshot','return '+functionText);
 const build=period=>factory(api,period,epoch,x=>loading.push(x),x=>errors.push(x),x=>data.push(x),
   ()=>{},()=>{},x=>notices.push(x),()=>{},()=>{},()=>{});
 return {queue,api,data,errors,loading,notices,build};
}
it('slower old date response cannot replace the newly selected stock-report range',async()=>{
 const s=setup();
 s.build({from:'2026-10-01',to:'2026-10-01'})();
 s.build({from:'2026-10-15',to:'2026-10-15'})();
 s.queue[1].resolve({branches:[{id:'new-range'}]});await flush();
 s.queue[0].resolve({branches:[{id:'old-range'}]});await flush();
 expect(s.data).toEqual([[{id:'new-range'}]]);expect(s.loading).toEqual([true,true,false]);
});
it('late old request error cannot hide the newer successful report',async()=>{
 const s=setup();s.build({})();s.build({})();
 s.queue[1].resolve({branches:[]});await flush();
 s.queue[0].reject(Error('old-range failure'));await flush();
 expect(s.errors).not.toContain('old-range failure');
});
it('critical source failure is unavailable, never an empty successful stock report',async()=>{
 const s=setup();s.api.stock.batches=async()=>{throw Error('batch source failed');};
 s.build({})();s.queue[0].resolve({branches:[]});await flush();
 expect(s.data).toEqual([]);expect(s.errors).toContain('batch source failed');
});
it('optional MIS failure is explicit rather than silently omitted',async()=>{
 const s=setup();s.api.mis.stockReport=async()=>{throw Error('MIS denied');};
 s.build({})();s.queue[0].resolve({branches:[]});await flush();
 expect(s.notices[0][0]).toMatch(/unavailable.*totals are not shown/);
});
