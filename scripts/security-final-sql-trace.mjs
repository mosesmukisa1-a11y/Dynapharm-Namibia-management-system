// Source-only trace capture. No source module is executed and no DB is imported.
// Positive local syntax facts are deliberately NOT whole-program SQL clearance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const base='generated-artifacts/sql-security-final-closure';
const prior='generated-artifacts/final-security-release-gate';
const digest=value=>createHash('sha256').update(value).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const original=await read(prior+'/remaining-66-review.json');
const callerReview=await read(prior+'/sql-caller-review.json');
const oldRecords=original.records;
if(oldRecords.length!==66||new Set(oldRecords.map(r=>`${r.file}:${r.line}:${r.column}`)).size!==66)
  throw Error('Original location coverage mismatch');
const callerRecords=callerReview.locations;
if(!Array.isArray(callerRecords)||callerRecords.length!==182)throw Error('Caller review coverage mismatch');
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async e=>
  e.isDirectory()?walk(dir+'/'+e.name):e.isFile()&&e.name.endsWith('.js')&&!e.name.endsWith('.test.js')?[dir+'/'+e.name]:[]))).flat();
const files=[...await walk('api'),'server.js'],modules=[],sinks=[];
const owner=p=>{
  for(let f=p.findParent(x=>x.isFunction());f;f=f.findParent(x=>x.isFunction())){
    if(f.node.id?.name)return f.node.id.name;
    if(f.parentPath.isVariableDeclarator()&&f.parentPath.node.id.type==='Identifier')return f.parentPath.node.id.name;
  }
  return '<module-or-anonymous-callback>';
};
for(const file of files){
  const source=await fs.readFile(file,'utf8'),sha256=digest(source);
  const ast=parse(source,{sourceType:'module',plugins:['jsx']});
  const imports=[],exports=[],dynamicImports=[],calls=[],functions=[];
  const resolve=value=>value.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),value)):value;
  traverse(ast,{
    ImportDeclaration(p){imports.push({source:resolve(p.node.source.value),bindings:p.node.specifiers.map(s=>({
      local:s.local.name,imported:s.imported?.name||s.imported?.value||(s.type==='ImportDefaultSpecifier'?'default':'*'),
    }))});},
    ExportNamedDeclaration(p){
      if(p.node.source)exports.push({source:resolve(p.node.source.value),kind:'re-export',
        names:p.node.specifiers.map(s=>({local:s.local?.name,exported:s.exported?.name}))});
      else exports.push({kind:'local',names:p.node.specifiers.map(s=>({local:s.local?.name,exported:s.exported?.name})),
        declaration:p.node.declaration?.id?.name||p.node.declaration?.type||null});
    },
    ExportAllDeclaration(p){exports.push({kind:'re-export-all',source:resolve(p.node.source.value)});},
    Function(p){functions.push({id:`${file}:${p.node.loc.start.line}:${p.node.loc.start.column}`,
      name:p.node.id?.name||(p.parentPath.isVariableDeclarator()?p.parentPath.node.id.name:null),
      line:p.node.loc.start.line,parameters:p.node.params.map(x=>x.name||x.left?.name||x.type),
      defaultExport:p.parentPath.isExportDefaultDeclaration()});},
    CallExpression(p){
      const n=p.node,c=p.get('callee');
      if(n.callee.type==='Import'){
        dynamicImports.push({line:n.loc.start.line,literal:n.arguments[0]?.type==='StringLiteral',
          target:n.arguments[0]?.type==='StringLiteral'?resolve(n.arguments[0].value):null,
          expressionSha256:digest(source.slice(n.start,n.end))});return;
      }
      const name=c.isIdentifier()?c.node.name:c.isMemberExpression()?
        (c.node.computed?c.node.property.value:c.node.property.name):null;
      const b=c.isIdentifier()?c.scope.getBinding(name):null;
      const imported=b?.path.isImportSpecifier()?{
        source:resolve(b.path.parentPath.node.source.value),name:b.path.node.imported.name,
      }:null;
      const description={line:n.loc.start.line,column:n.loc.start.column,function:owner(p),
        callee:name||'<computed-call>',imported,argumentKinds:n.arguments.map(a=>a.type),
        callbackArguments:n.arguments.flatMap((a,i)=>['ArrowFunctionExpression','FunctionExpression'].includes(a.type)?[{index:i,line:a.loc.start.line}]:[])};
      calls.push(description);
      if(!['query','getOne','getMany'].includes(imported?.name||name))return;
      const a=p.get('arguments.0');
      const bindings=[];
      const recordBinding=ref=>{
        const binding=ref.scope.getBinding(ref.node.name);if(!binding)return;
        bindings.push({name:ref.node.name,kind:binding.kind,constant:binding.constant,
          writes:binding.constantViolations.length,line:binding.path.node.loc?.start.line,
          declarationKind:binding.path.node.type,initializerKind:binding.path.node.init?.type||null,
          importedFrom:binding.path.isImportSpecifier()?resolve(binding.path.parentPath.node.source.value):null});
      };
      if(a?.isReferencedIdentifier())recordBinding(a);
      if(a?.node)a.traverse({ReferencedIdentifier:recordBinding});
      const pureLiteral=a?.isStringLiteral()||a?.isTemplateLiteral()&&a.node.expressions.length===0;
      sinks.push({...description,file,sourceSha256:sha256,
        argumentSha256:a?.node?digest(source.slice(a.node.start,a.node.end)):null,
        localSyntax:pureLiteral?'literal SQL structure':'requires value/identifier/caller propagation',
        templateInterpolations:a?.isTemplateLiteral()?a.node.expressions.length:null,
        bindings:[...new Map(bindings.map(x=>[x.name+':'+x.line,x])).values()],
      });
    },
  });
  modules.push({file,sha256,imports,exports,dynamicImports,functions,calls});
}
const hardening={
  'api/db.js':'Finite table/field policy, immutable descriptor snapshots, finite ordering, fixed id column. Raw executors still need all-caller closure.',
  'api/branch/walkin-sales.js':'Static read templates, typed/bound pagination and finite enriched sale-record fields.',
  'api/employees.js':'Finite employee fields and statement builders; validate full caller/alias context.',
  'api/hr/staff-change-requests.js':'Static bound JSON profile update; session/approval actor retained.',
  'api/reports/branch-sales/daily.js':'Static movement queries, bound scope and Windhoek half-open day.',
  'api/reports/branch-sales/monthly.js':'Static movement queries, bound scope and Windhoek month interval.',
  'api/staff/profile.js':'Static typed-row JSON update with finite contact fields.',
  'api/stock-requests.js':'One bound JSON recordset for request items; atomic outer behavior retained.',
  'api/stock/transfers.js':'One bound JSON recordset for transfer items; atomic outer behavior retained.',
  'api/supplier-imports.js':'Static optional predicates and typed/bound limit.',
  'api/warehouse/inventory.js':'Typed/bound movement pagination; remaining fixed predicate arrays need full trace.',
  'api/services/controlledStock.js':'Frozen finite batch statement map with own-property lookup.',
  'api/services/controlledStockRegister.js':'Finite location expressions and complete-view pre-query validation; remaining builders need closure.',
  'api/services/saleEvidence.js':'Two explicit fixed source-table updates replacing dynamic table interpolation.',
  'api/services/saleEvidenceRepair.js':'Two explicit fixed source-table updates; original evidence wins.',
  'server.js':'Own-property stock-edit field lookup; startup array/callback contexts still require trace.',
};
const records=oldRecords.map(r=>{
  const m=modules.find(m=>m.file===r.file);
  const candidates=sinks.filter(s=>s.file===r.file&&(s.function===r.function||
    r.function?.includes('anonymous')));
  const retained=r.finalClassification==='static SQL with bound values';
  return {
    originalLocation:r.originalLocation||{file:r.file,line:r.line,column:r.column},
    file:r.file,function:r.function,callFamily:r.callFamily,priorClassification:r.finalClassification,
    originalSourceSha256:r.sourceSha256,currentSourceSha256:m?.sha256||null,
    originalProductionReachability:r.productionReachability,
    currentImporters:modules.filter(x=>x.imports.some(i=>i.source===r.file)||x.exports.some(i=>i.source===r.file)).map(x=>x.file),
    currentFamilyCandidates:candidates.map(c=>({line:c.line,column:c.column,callee:c.callee,
      localSyntax:c.localSyntax,argumentSha256:c.argumentSha256,bindings:c.bindings})),
    changedConstruction:hardening[r.file]||'No construction change claimed; inspect current source and graph.',
    aliasReexportCallbackImportTrace:'PARTIAL: current module/call graph retained; no automatic whole-program closure claim.',
    branchPaginationTransactionContext:'NOT VERIFIED for every caller; isolated regressions do not substitute for complete source propagation.',
    finalClassification:retained?'RETAINED LOCAL BOUNDARY; global context not cleared':'NOT VERIFIED — RELEASE BLOCKER',
    genericExecutorCleared:false,
  };
});
await fs.mkdir(base,{recursive:true});
await fs.writeFile(base+'/sql-location-inventory.json',JSON.stringify({
  status:'BLOCKED - DO NOT PUBLISH',allOriginalLocationsRetained:true,originalLocations:66,
  originalUnresolvedLocations:61,unresolvedReleaseLocations:records.filter(r=>r.finalClassification.startsWith('NOT VERIFIED')).length,
  originalCallerReviewLocations:182,originalWholeInventoryCalls:original.originalWholeInventoryCalls,
  currentSinkCount:sinks.length,genericExecutorCleared:false,hostileEndpointCoverageComplete:false,
  caveat:'Local hardening and regression results are not full alias/callback/import/permission-context closure. Additional opaque current sites may remain.',
  records,
  originalCallerReview:callerRecords.map(r=>({file:r.file,line:r.line,column:r.column,function:r.function,
    finalClassification:r.finalClassification||r.classification||'Retained prior record; see original review',currentContextCleared:false})),
},null,2)+'\n');
await fs.writeFile(base+'/current-source-call-graph.json',JSON.stringify({
  sourceOnly:true,sourceModulesExecuted:false,productionAccess:false,modules,sinks,
},null,2)+'\n');
console.log(JSON.stringify({originalLocations:records.length,currentSinks:sinks.length,
  unresolved:records.filter(r=>r.finalClassification.startsWith('NOT VERIFIED')).length,genericExecutorCleared:false}));
