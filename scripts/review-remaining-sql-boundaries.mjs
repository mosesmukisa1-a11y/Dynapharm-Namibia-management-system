// Source-only review of every one of the previously retained 66 locations.
// This records unresolved alias/callback boundaries; it does NOT waive them.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const out='generated-artifacts/final-security-release-gate';
const old=JSON.parse(await fs.readFile('generated-artifacts/security-release-gate-final/sql-family-reachability.json','utf8'));
const current=JSON.parse(await fs.readFile(out+'/sql-family-reachability.json','utf8'));
const baseline=old.locations.filter(r=>r.classification==='unresolved blocker');
if(baseline.length!==66)throw Error('Retained 66-location baseline changed');
const reached=new Set(['api/reports/branch-sales/daily.js','api/reports/branch-sales/monthly.js',
  'api/reports/branch-sales/summary.js','api/mis/csi-entries.js','api/mis/receipts.js',
  'api/mis/stock-report.js','api/warehouse/inventory.js','api/employees.js',
  'api/staff/profile.js','api/services/controlledStockRegister.js','api/services/stockLedgerPage.js']);
const records=[];let repeatedVisitorPaths=0;
for(const file of new Set(baseline.map(r=>r.file))){
  const source=await fs.readFile(file,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});
  const wanted=new Map(baseline.filter(r=>r.file===file).map(r=>[r.line+':'+r.column,r]));
  const calls=[];
  traverse(ast,{CallExpression(call){calls.push(call);}});
  const completed=new Set();
  // Binding traversal must not reuse the outer visitor's active path context.
  for(const call of calls){
    const key=call.node.loc.start.line+':'+(call.node.loc.start.column+1);
    const original=wanted.get(key);if(!original)continue;
    if(completed.has(key)){repeatedVisitorPaths++;continue;}
    completed.add(key);
    const row=current.locations.find(r=>r.file===file&&r.line===original.line&&r.column===original.column);
    if(!row)throw Error('Current source call lost from inventory');
    const argument=call.get('arguments.0'),bindings=[],seen=new Set();
    function follow(p,depth=0){
      if(!p?.node||depth>6)return;
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);if(!b||seen.has(b))return;seen.add(b);
        const origin=b.path.parentPath;
        const item={name:p.node.name,kind:b.kind,constant:b.constant,declaredAt:b.path.node.loc?.start.line,
          originNode:b.path.node.type,assignmentLines:b.constantViolations.map(v=>v.node.loc.start.line),
          referenceContexts:[...new Set(b.referencePaths.map(r=>r.parentPath.node.type))]};
        if(b.path.isImportSpecifier()||b.path.isImportDefaultSpecifier()){
          item.importSource=origin.node.source.value;
          item.imported=b.path.node.imported?.name||'default';
          if(item.importSource.startsWith('.'))item.resolvedModule=path.posix.normalize(
            path.posix.join(path.posix.dirname(file),item.importSource));
          item.propagation='ESM binding identity recorded; whole callee return/alias flow NOT VERIFIED';
        }else if(b.kind==='param'){
          const fn=b.path.getFunctionParent(),parent=fn?.parentPath;
          item.propagation='Function/callback argument; all concrete caller origins NOT VERIFIED';
          item.functionNode=fn?.node.type;
          item.callbackContainer=parent?.node.type;
          if(parent?.isCallExpression())item.passedTo=source.slice(parent.node.callee.start,parent.node.callee.end);
        }else if(b.path.isVariableDeclarator()){
          const init=b.path.get('init');
          item.initializerNode=init.node?.type||null;
          item.propagation='Local initializer and mutation/reference contexts retained; bounded proof only';
          follow(init,depth+1);
        }else item.propagation='Destructured/loop/function binding; interprocedural flow NOT VERIFIED';
        bindings.push(item);return;
      }
      // Only identifier references, not SQL strings or runtime values, are saved.
      p.traverse({ReferencedIdentifier(ref){follow(ref,depth+1);}});
    }
    follow(argument);
    records.push({
      originalLocation:{file,line:original.line,column:original.column},
      file,line:row.line,column:row.column,function:row.function,callFamily:row.callFamily,
      sourceSha256:createHash('sha256').update(source).digest('hex'),
      productionReachability:row.reachability,
      sqlStructure:{node:argument.node?.type,sourceLocation:file+':'+argument.node?.loc.start.line,
        sourceExpression:source.slice(argument.node.start,argument.node.end),
        boundedProof:row.evidence},
      identifierSource:row.classification==='unresolved blocker'?
        'See expression and binding graph; full identifier provenance NOT VERIFIED':
        'Source fixed keys/numeric structure; no arbitrary request identifier accepted by bounded proof',
      boundValues:{separateArgument:row.hasValueArguments,
        wholeFlowVerified:false,limitation:'Argument separation is not whole-program value/identifier taint proof'},
      aliasCallbackImportPropagation:bindings,
      hostileInputTest:reached.has(file)?{
        source:'tests/sql-endpoint-families.unit.test.js',
        coverage:'PARTIAL: actual reached read/update handler or service; inert query recorder, not PostgreSQL execution',
        everyBranchCovered:false,
      }:{source:null,coverage:'NOT VERIFIED for this endpoint/callback family',everyBranchCovered:false},
      supportingGrammarTests:'tests/sql-caller-proof.unit.test.js',
      finalClassification:row.classification,
      genericExecutorCleared:false,
      remainingWork:row.classification==='unresolved blocker'?
        'Complete concrete caller/alias/import/callback proof and all relevant hostile endpoint branches before resolution':
        'Bounded source proof only; no generic executor or full endpoint permission claim',
    });
  }
}
if(records.length!==66)throw Error('All 66 original locations must remain reviewable; actual='+records.length+
  '; missing='+baseline.filter(r=>!records.some(x=>x.file===r.file&&x.line===r.line&&x.column===r.column))
    .map(r=>r.file+':'+r.line+':'+r.column).join(','));
const counts={};for(const r of records)counts[r.finalClassification]=(counts[r.finalClassification]||0)+1;
await fs.writeFile(out+'/remaining-66-review.json',JSON.stringify({
  status:'BLOCKED - DO NOT PUBLISH',allOriginalLocationsRetained:true,reviewedCount:66,counts,
  repeatedVisitorPaths,locationIdentity:'File plus exact start line/column; every distinct retained location required',
  originalWholeInventoryCalls:2833,additionalProductionOperations:0,genericExecutorCleared:false,
  hostileEndpointCoverageComplete:false,records,
},null,2));
console.log(JSON.stringify({retained:records.length,counts,genericExecutorCleared:false}));
