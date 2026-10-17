import {beforeEach,describe,it,expect,vi} from 'vitest';
let q;
const definitions=()=>({
  select:{chunks:['SELECT id FROM clients WHERE id=$1'],slots:[],operation:'read',contexts:['service','transaction'],kind:'statement',group:'clients'},
  filter:{chunks:[' AND branch=$2'],slots:[],operation:'read',contexts:['service','transaction'],kind:'fragment',group:'clients'},
  other:{chunks:[' AND role=$2'],slots:[],operation:'read',contexts:['service'],kind:'fragment',group:'users'},
  page:{chunks:['SELECT id FROM clients WHERE id=$1',' LIMIT ' ,''],slots:[{kind:'part'},{kind:'integer',min:1,max:500}],operation:'read',contexts:['service','transaction'],kind:'statement',group:'clients'},
  choice:{chunks:['SELECT id FROM ',''],slots:[{kind:'choice',choices:['clients','employees']}],operation:'read',contexts:['service'],kind:'statement',group:'clients'},
  schema:{chunks:['CREATE TABLE example(id int)'],slots:[],operation:'schema',contexts:['startup'],kind:'statement',group:'startup'},
});
beforeEach(async()=>{vi.resetModules();q=await import('../api/services/queryDescriptors.js');q.installQueryCatalog(definitions());});
describe('registered SQL admission',()=>{
  it('rejects plain strings, forged objects, copies and inherited brands',()=>{
    const d=q.bindPlan(q.registeredPlan('select'),['synthetic']);
    for(const bad of ['SELECT 1',{text:'SELECT 1',values:[]},{...d},Object.create(d)])
      expect(()=>q.executionArguments(bad)).toThrow('Query boundary');
  });
  it('seals catalog registration before callers can change or append queries',()=>{
    expect(()=>q.installQueryCatalog(definitions())).toThrow();
    expect(()=>q.registeredPlan('select; DROP TABLE clients')).toThrow();
    expect(()=>q.registeredPlan('__proto__')).toThrow();
  });
  it('keeps values bound while SQL structure and identity stay immutable',()=>{
    const attack="quote'; UNION SELECT 1; --";
    const d=q.bindPlan(q.registeredPlan('select'),[attack]);
    const actual=q.executionArguments(d);
    expect(actual.text).not.toContain(attack);expect(actual.values).toEqual([attack]);
    expect(d.queryId).toBe('select');expect(d.operation).toBe('read');
    expect(Object.isFrozen(d)).toBe(true);expect(Object.isFrozen(d.values)).toBe(true);
  });
  it('takes a deep snapshot before mutable aliases change',()=>{
    const value={ids:[1,2]},params=[value],d=q.bindPlan(q.registeredPlan('select'),params);
    value.ids.push(3);params[0]='changed';
    expect(q.executionArguments(d).values[0].ids).toEqual([1,2]);
  });
  it('rejects accessor values without calling getters',()=>{
    let reads=0;const value={};Object.defineProperty(value,'private',{enumerable:true,get(){reads++;return 'no';}});
    expect(()=>q.bindPlan(q.registeredPlan('select'),[value])).toThrow();expect(reads).toBe(0);
  });
  it('rejects inherited, constructor and prototype value fields',()=>{
    for(const value of [Object.create({hidden:1}),JSON.parse('{\"__proto__\":{}}'),{constructor:'x'},{prototype:'x'}])
      expect(()=>q.bindPlan(q.registeredPlan('select'),[value])).toThrow();
  });
  it('rejects cyclic and non-finite values',()=>{
    const v={};v.loop=v;
    for(const value of [v,NaN,Infinity,()=>1])expect(()=>q.bindPlan(q.registeredPlan('select'),[value])).toThrow();
  });
  it('rejects tampering with publicly visible Date snapshots',()=>{
    const d=q.bindPlan(q.registeredPlan('select'),[new Date('2026-10-17T00:00:00Z')]);
    d.values[0].setUTCFullYear(2030);expect(()=>q.executionArguments(d)).toThrow();
  });
  it('rejects tampering with public binary snapshots',()=>{
    const d=q.bindPlan(q.registeredPlan('select'),[Buffer.from([1,2])]);
    d.values[0][0]=9;expect(()=>q.executionArguments(d)).toThrow();
  });
  it('rejects replacing bound values at execution',()=>{
    const d=q.bindPlan(q.registeredPlan('select'),['one']);
    expect(()=>q.executionArguments(d,['two'])).toThrow();
  });
  it('allows only finite identifier choices, never comments or operators',()=>{
    const d=q.bindPlan(q.registeredPlan('choice',['clients']),[]);
    expect(q.executionArguments(d).text).toBe('SELECT id FROM clients');
    for(const value of ['clients; DROP TABLE clients','clients --','clients UNION SELECT','__proto__'])
      expect(()=>q.registeredPlan('choice',[value])).toThrow();
  });
  it('accepts only typed bounded integer pagination',()=>{
    const filter=q.registeredPlan('filter');
    for(const n of ['2',0,-1,501,1.5,NaN,Infinity,{},'1;SELECT 1'])
      expect(()=>q.registeredPlan('page',[filter,n])).toThrow();
    expect(q.executionArguments(q.bindPlan(q.registeredPlan('page',[filter,2]),['id','own'])).text).toContain('LIMIT 2');
  });
  it('rejects raw SQL fragments and fragments from a different family',()=>{
    for(const fragment of [' AND true',q.registeredPlan('other'),q.registeredPlan('select')])
      expect(()=>q.registeredPlan('page',[fragment,2])).toThrow();
  });
  it('rejects structural accessor slots without invoking them',()=>{
    let reads=0;const slots=[];Object.defineProperty(slots,'0',{get(){reads++;return q.registeredPlan('filter');}});
    slots[1]=2;expect(()=>q.registeredPlan('page',slots)).toThrow();expect(reads).toBe(0);
  });
  it('snapshots joined plans and rejects mutated aliases containing strings',()=>{
    const list=[q.registeredPlan('filter')],p=q.joinPlans(list,'and');
    list[0]=' OR true';
    const d=q.bindPlan(q.registeredPlan('page',[p,2]),['id','own']);
    expect(q.executionArguments(d).text).not.toContain('OR true');
    expect(()=>q.joinPlans(list,'and')).toThrow();
  });
  it('does not call overridden array methods or getters',()=>{
    let called=0;const list=[q.registeredPlan('filter')];list.map=()=>{called++;return[];};
    expect(()=>q.joinPlans(list)).toThrow();expect(called).toBe(0);
  });
  it('does not execute fragments or mix two complete statements',()=>{
    expect(()=>q.bindPlan(q.registeredPlan('filter'),[])).toThrow();
    expect(()=>q.joinPlans([q.registeredPlan('select'),q.registeredPlan('select')])).toThrow();
  });
  it('enforces execution contexts for schema queries',()=>{
    const d=q.bindPlan(q.registeredPlan('schema'),[]);
    expect(()=>q.executionArguments(d)).toThrow();
    expect(q.withQueryContext('startup',()=>q.executionArguments(d).operation)).toBe('schema');
  });
  it('executes only a branded bound descriptor through adapter callbacks',async()=>{
    const adapter=vi.fn(async(d,values)=>q.executionArguments(d,values));
    const result=await q.executePlan(adapter,q.registeredPlan('select'),['id']);
    expect(result.values).toEqual(['id']);expect(adapter).toHaveBeenCalledTimes(1);
    expect(()=>q.executePlan(adapter,'SELECT 1',[])).toThrow();
  });
  it('rejects proxies without executing their traps',()=>{
    let calls=0;const p=new Proxy({}, {getPrototypeOf(){calls++;return Object.prototype;},ownKeys(){calls++;return[];}});
    expect(()=>q.bindPlan(q.registeredPlan('select'),[p])).toThrow();expect(calls).toBe(0);
  });
  it('rejects customized Date methods without invoking them',()=>{
    let calls=0;const d=new Date();d.getTime=()=>{calls++;return 0;};
    expect(()=>q.bindPlan(q.registeredPlan('select'),[d])).toThrow();expect(calls).toBe(0);
  });
  it('gives callbacks no raw client, release or transaction-control string escape',async()=>{
    const driver=vi.fn(async()=>({rows:[{id:'synthetic'}]}));
    const client=q.restrictedDescriptorExecutor(driver);
    expect(Object.keys(client)).toEqual(['query']);expect(Object.isFrozen(client)).toBe(true);
    for(const text of ['SELECT 1','ROLLBACK','COMMIT',{text:'SELECT 1',values:[]}])
      expect(()=>client.query(text)).toThrow();
    expect(driver).not.toHaveBeenCalled();
    const d=q.bindPlan(q.registeredPlan('select'),['synthetic']);
    expect((await client.query(d)).rows).toHaveLength(1);expect(driver).toHaveBeenCalledTimes(1);
    expect(client.release).toBeUndefined();expect(client.connect).toBeUndefined();
  });
  it('prevents request or transaction callbacks from escalating to startup',()=>{
    expect(()=>q.withQueryContext('transaction',()=>q.withQueryContext('startup',()=>1))).toThrow();
    expect(()=>q.withQueryContext('request',()=>q.withQueryContext('startup',()=>1))).toThrow();
    expect(()=>q.withQueryContext('startup',()=>1)).toThrow();
  });
  it('provides no public environment-flag shortcut into owned-tool context',()=>{
    expect(()=>q.withQueryContext('owned-tool',()=>1)).toThrow();
    q.sealStartupContext();expect(()=>q.withQueryContext('startup',()=>1)).toThrow();
  });
});
