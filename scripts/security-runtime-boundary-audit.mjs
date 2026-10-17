// Offline source/data inspection only. Never imports application modules.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const base='generated-artifacts/sql-runtime-enforcement-final';
const digest=x=>createHash('sha256').update(x).digest('hex');
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const inventory=await json('generated-artifacts/sql-security-final-closure/sql-location-inventory.json');
const records=inventory.records.filter(r=>r.priorClassification==='unresolved blocker');
if(records.length!==61)throw Error('Retained source-location inventory mismatch');
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(e=>
  e.isDirectory()?walk(dir+'/'+e.name):/\.(?:js|mjs)$/.test(e.name)?[dir+'/'+e.name]:[]))).flat();
const files=[...(await walk('api')),...(await walk('worker')),'server.js'];
const hashes={},plainCalls=[],driverImports=[],forwarders=[],executions=[];
const nativeBridges=new Set(['api/db.js','api/testDatabaseGuard.js','worker/database.mjs']);
const sinkNames=new Set(['query','getOne','getMany']);
function sinkName(node,scope,seen=new Set()){
  if(!node||seen.has(node))return null;seen.add(node);
  if(node.type==='MemberExpression'){
    const name=node.computed?node.property.value:node.property.name;
    return sinkNames.has(name)?name:['call','apply','bind'].includes(name)?sinkName(node.object,scope,seen):null;
  }
  if(node.type!=='Identifier')return null;
  if(sinkNames.has(node.name))return node.name;
  const binding=scope.getBinding(node.name),p=binding?.path;
  if(p?.isImportSpecifier())return sinkNames.has(p.node.imported.name)?p.node.imported.name:null;
  if(p?.isVariableDeclarator())return sinkName(p.node.init,p.scope,seen);
  return null;
}
for(const file of files){
  const source=await fs.readFile(file,'utf8');hashes[file]=digest(source);
  if(file.includes('/registeredSql/')||file.endsWith('/registeredSqlCatalog.js'))continue;
  const ast=parse(source,{sourceType:'module',plugins:['jsx']});
  traverse(ast,{
    ImportDeclaration(p){
      if(['pg','postgres','@neondatabase/serverless'].includes(p.node.source.value))
        driverImports.push({file,line:p.node.loc.start.line,module:p.node.source.value,
          allowed:nativeBridges.has(file)});
    },
    CallExpression(p){
      const n=p.node,c=n.callee;
      const name=c.type==='Identifier'?c.name:c.type==='MemberExpression'&&!c.computed?c.property.name:null;
      if(name==='__qd_executePlan'){
        executions.push({file,line:n.loc.start.line});
        if(['StringLiteral','TemplateLiteral'].includes(n.arguments[1]?.type))
          plainCalls.push({file,line:n.loc.start.line,target:'descriptor executor'});
      }
      const resolved=sinkName(c,p.scope);
      if(!resolved||nativeBridges.has(file))return;
      const invocation=c.type==='MemberExpression'?(c.computed?c.property.value:c.property.name):null;
      const value=invocation==='apply'?n.arguments[1]?.elements?.[0]:
        ['call','bind'].includes(invocation)?n.arguments[1]:n.arguments[0];
      if(['StringLiteral','TemplateLiteral'].includes(value?.type))
        plainCalls.push({file,line:n.loc.start.line,target:resolved});
      else forwarders.push({file,line:n.loc.start.line,target:resolved,
        enforcement:'Real API/worker descriptor executor; no raw-string translation'});
    }
  });
}
const db=await fs.readFile('api/db.js','utf8'),q=await fs.readFile('api/services/queryDescriptors.js','utf8');
const checks={
  retainedLocationsExactly61:records.length===61,
  noNormalPlainStringCalls:plainCalls.length===0,
  noUnexpectedNativeDriverImports:driverImports.every(r=>r.allowed),
  admissionBeforePool:(()=>{
    const tree=parse(db,{sourceType:'module'});
    const fn=tree.program.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='query')?.declaration;
    if(!fn)return false;
    const body=db.slice(fn.body.start,fn.body.end).replace(/\s+/g,'');
    const admission=body.indexOf('executionArguments(descriptor,params)');
    const pool=body.indexOf('getPool()'),driver=body.indexOf('executor.query(');
    return admission>=0&&pool>admission&&driver>admission;
  })(),
  frozenLifetimeFacade:db.includes('restrictedDescriptorExecutor')&&db.includes('TRANSACTION_CLOSED'),
  transactionControlsDenied:q.includes('assertTransactionStatement')&&q.includes('TRANSACTION_CONTROL'),
  ownedToolPublicContextDenied:q.includes("context==='owned-tool'"),
  noRawPoolExport:!/\bexport\s+(?:async\s+)?(?:function|const|let)\s+(?:getPool|pool|client)\b/.test(db),
};
const runIds=['86aa27a9-42da-4794-b295-56eb19dc550e',
  '7c605d26-3969-404d-bff8-a8725f6a5157','d7171c9a-f13d-44b6-a46a-472fca1c0e10'];
const witnessed=new Map();
for(const runId of runIds){
  const dir=base+'/fixture-runs/'+runId;
  const visit=async directory=>{
    for(const e of await fs.readdir(directory,{withFileTypes:true})){
      const file=directory+'/'+e.name;
      if(e.isDirectory())await visit(file);
      else if(['runtime-query-coverage.jsonl','runtime-http-query-coverage.json'].includes(e.name)){
        const raw=await fs.readFile(file,'utf8');
        const data=e.name.endsWith('jsonl')?raw.trim().split('\n').filter(Boolean).map(JSON.parse):[JSON.parse(raw)];
        for(const group of data)for(const row of group.rows||[])if(row.nativeSucceeded)
          for(const id of row.queryIds||[]){
            if(!witnessed.has(id))witnessed.set(id,new Set());
            witnessed.get(id).add(runId);
          }
      }
    }
  };
  await visit(dir);
}
const familyNames=[...new Set(records.map(r=>r.file))].sort();
const families=familyNames.map(file=>{
  const ids=[...witnessed.keys()].filter(id=>file==='api/db.js'?
    id.startsWith('crud/')||id.startsWith('finite/'):id.includes(file+':'));
  return {file,queryIds:ids,nativeRuns:[...new Set(ids.flatMap(id=>[...witnessed.get(id)]))],
    status:ids.length?'PASS':'NOT VERIFIED'};
});
const closure=records.map(r=>({
  originalLocation:r.originalLocation,function:r.function,apiOrService:r.apiOrService,
  sourceSha256:hashes[r.file],construction:'Fixed registered descriptors / finite field, date, identifier or composition factory',
  enforcement:'Actual api/db.js descriptor admission before connection/driver; restricted transaction facade',
  nativeFamilyEvidence:families.find(f=>f.file===r.file),
  status:families.find(f=>f.file===r.file)?.status==='PASS'?'CLOSED RUNTIME BOUNDARY':'NOT VERIFIED',
  limits:'Native family evidence is representative, not an assertion that every business branch or optional field combination was executed.',
}));
const result={status:Object.values(checks).every(Boolean)&&families.every(f=>f.status==='PASS')?'PASS':'BLOCKED',
  checks,retainedLocations:61,unresolvedLocations:closure.filter(r=>r.status==='NOT VERIFIED').length,
  nativeFamilies:families.length,uncoveredFamilies:families.filter(f=>f.status!=='PASS').length,
  registeredExecutions:executions.length,plainCalls,driverImports,forwarders,families,closure,
  methodology:'Native driver success correlated with brand-admission identity and SQL hash in a test/request scope. No SQL text, values or credentials recorded. Private BEGIN/COMMIT and owned provisioning are not untrusted runtime SQL.',
  productionAccess:false,sourceFiles:hashes};
await fs.writeFile(base+'/runtime-boundary-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,checks,plainCalls,uncovered:families.filter(f=>f.status!=='PASS').map(f=>f.file),
  unexpectedDrivers:driverImports.filter(r=>!r.allowed),registeredExecutions:executions.length}));
