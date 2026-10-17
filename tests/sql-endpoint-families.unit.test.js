// @vitest-environment node
// Actual handler/service invocation with an inert query recorder. These tests
// prove SQL/value separation for the reached paths, not session/role correctness
// or PostgreSQL execution. The real browser and DB gates are separate.
import {it,expect,vi,beforeEach} from 'vitest';
const recorder=vi.hoisted(()=>({calls:[]}));
vi.mock('../api/db.js',()=>{
  const query=vi.fn(async(text,params=[])=>{
    recorder.calls.push({text,params});
    const rows=text.includes(' AS stock,')?[{stock:[],branches:[],reservations:[],segregated:[]}]:
      /SELECT id FROM warehouse_locations/.test(text)?[{id:params[0]}]:[];
    return {rows,rowCount:rows.length};
  });
  const client={query};
  return {query,getMany:async(t,p)=>(await query(t,p)).rows,
    getOne:async(t,p)=>(await query(t,p)).rows[0]||null,
    withTransaction:async fn=>fn(client),withRequestTransaction:async fn=>fn(),
    publishRealtimeEvent:vi.fn(),deferUntilCommit:()=>false,closePool:vi.fn(),
    insert:vi.fn(),update:vi.fn(),remove:vi.fn(),findAll:vi.fn(),findById:vi.fn()};
});
const marker='SQL_SENTINEL_ATTACK';
const hostile="SQL_SENTINEL_ATTACK'); DROP TABLE sql_sentinel; --";
const user={id:'SYNTHETIC-SQL-STAFF',username:'synthetic-sql-staff',role:'gm',branch:'townshop'};
function response(){
  return {statusCode:200,status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;},
    setHeader(){},end(){return this;},send(b){this.body=b;return this;}};
}
function verifyQueries(){
  expect(recorder.calls.length).toBeGreaterThan(0);
  for(const call of recorder.calls){
    expect(typeof call.text).toBe('string');
    expect(call.text.toUpperCase()).not.toContain(marker);
    expect(call.params).toBeInstanceOf(Array);
  }
  expect(recorder.calls.some(c=>JSON.stringify(c.params).toUpperCase().includes(marker))).toBe(true);
}
beforeEach(()=>{recorder.calls.length=0;});
const readCases=[
  ['branch daily','../api/reports/branch-sales/daily.js',{branch_id:hostile,date:'2026-10-17'}],
  ['branch monthly','../api/reports/branch-sales/monthly.js',{branch_id:hostile,month:'2026-10',year:'2026'}],
  ['branch summary','../api/reports/branch-sales/summary.js',{branch:hostile,from:'2026-10-01',to:'2026-10-17'}],
  ['MIS CSI','../api/mis/csi-entries.js',{branch:hostile,startDate:'2026-10-01',endDate:'2026-10-17'}],
  ['MIS receipts','../api/mis/receipts.js',{branch:hostile,q:hostile,start:'2026-10-01',end:'2026-10-17'}],
  ['MIS stock report','../api/mis/stock-report.js',{branch:hostile,start:'2026-10-01',end:'2026-10-17'}],
  ['warehouse inventory','../api/warehouse/inventory.js',{warehouse:hostile,product:hostile,search:hostile}],
  ['warehouse movements','../api/warehouse/inventory.js',{includeMovements:'1',warehouse:hostile,limit:'12); DROP TABLE sql_sentinel; --'}],
];
it.each(readCases)('%s binds hostile branch/search text on its actual read handler',async(_name,module,params)=>{
  const handler=(await import(module)).default,res=response();
  await handler({method:'GET',url:'/api/synthetic?'+new URLSearchParams(params),headers:{host:'synthetic.invalid'},
    user,query:params},res);
  expect(res.statusCode,JSON.stringify(res.body)).toBe(200);
  verifyQueries();
  if(_name==='warehouse movements')
    expect(recorder.calls.some(c=>c.text.includes('FROM warehouse_inventory_movements'))).toBe(true);
});
it('employee DELETE chooses a fixed identifier and binds hostile employee identity',async()=>{
  const handler=(await import('../api/employees.js')).default,res=response();
  await handler({method:'DELETE',url:'/api/employees?'+new URLSearchParams({employeeId:hostile}),
    headers:{host:'synthetic.invalid'},user:{...user,role:'admin'}},res);
  expect(res.statusCode).toBe(404);
  verifyQueries();
  expect(recorder.calls.at(-1).text).toContain('WHERE employee_id = $1');
});
it('staff profile ignores unapproved field names and binds values for approved fields',async()=>{
  const handler=(await import('../api/staff/profile.js')).default,res=response();
  await handler({method:'PUT',headers:{},user,body:{action:'update_contact',phone:hostile,[hostile]:'must not become a column'}},res);
  expect(res.statusCode,JSON.stringify(res.body)).toBe(200);
  verifyQueries();
  expect(recorder.calls.at(-1).text).toContain('phone = $2');
});
it('controlled register binds search/location and rejects hostile status/type before query',async()=>{
  const {readControlledStockRegister}=await import('../api/services/controlledStockRegister.js');
  const client={query:async(text,params)=>{recorder.calls.push({text,params});
    return {rows:/COUNT\(\*\)/i.test(text)?[{total:0}]:[]};}};
  const options={fail:(message)=>{throw Error(message);},physicalBatchSnapshot:vi.fn()};
  await readControlledStockRegister(client,user,{view:'all',location:hostile,batch_search:hostile,operation_search:hostile},options);
  verifyQueries();
  for(const input of [{batch_type:hostile},{batch_status:hostile},{view:hostile},
    {view:'operations',operation_status:hostile},{batch_page:hostile}]){
    recorder.calls.length=0;
    await expect(readControlledStockRegister(client,user,input,options)).rejects.toThrow();
    expect(recorder.calls).toHaveLength(0);
  }
});
it('ledger binds hostile search and branch scope rather than embedding them in SQL',async()=>{
  const {stockLedgerPage}=await import('../api/services/stockLedgerPage.js');
  await stockLedgerPage(new URL('http://synthetic.invalid/?'+new URLSearchParams({search:hostile,branch:hostile,limit:'20'})),
    {enforced:false,branches:[]});
  verifyQueries();
});
