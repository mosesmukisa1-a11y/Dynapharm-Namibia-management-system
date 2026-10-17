// Repository-only schema provenance and SQL call-site inventory. No DB/network.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {eligibleUntrackedSchemaSource,readVerifiedCandidateFiles} from './lib/schema-candidate-files.mjs';
const root=process.cwd(),out='generated-artifacts/security-remediation-final';
await fs.mkdir(out,{recursive:true});
const verifiedCandidate=await readVerifiedCandidateFiles(root);
const tracked=verifiedCandidate||execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const untracked=verifiedCandidate?[]:execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'})
  .split('\0').filter(eligibleUntrackedSchemaSource);
const files=[...new Set([...tracked,...untracked])].filter(f=>/\.(?:sql|js|mjs|jsx|ts)$/.test(f)&&
  !/^(?:attached_assets|node_modules|generated-artifacts|\.local)\//.test(f));
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const[k,v]of Object.entries(n)){
  if(['loc','extra','start','end'].includes(k))continue;
  if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);}}
const definitions=[],inventory=[],parseFailures=[],escapes=[],trees=new Map();
const wanted=['online_orders','branch_distributor_profit','stock_linked_reversals','branches',
  'branch_activity_transactions','users.additional_roles'];
function schema(sql,file,line){
  for(const table of wanted){
    const pattern=table.includes('.')?/\bALTER\s+TABLE\s+(?:public\.)?["']?users["']?[\s\S]{0,500}?\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?additional_roles\b/ig:
      new RegExp('\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?["\\\']?'+table+'["\\\']?\\s*\\(','ig');
    if(pattern.test(sql))definitions.push({object:table,file,line,
      eligible:!/^tests\//.test(file)&&!/^scripts\/security-(?:closure|final)/.test(file),
      provenance:/^(?:migrations|backend)\//.test(file)?'repository SQL definition':
        /^api\//.test(file)?'runtime static schema definition':'test/tool definition, not canonical authority',
      statementSha256:createHash('sha256').update(sql).digest('hex')});
  }
}
for(const file of files){
  const text=await fs.readFile(file,'utf8');
  if(file.endsWith('.sql')){schema(text,file,1);continue;}
  try{trees.set(file,parse(text,{sourceType:'unambiguous',plugins:['jsx',...(file.endsWith('.ts')?['typescript']:[])]}));}
  catch{if(/^(api|scripts|worker|migrations)\//.test(file)||file==='server.js')parseFailures.push({file});}
}
const methods=new Set(['query','getOne','getMany','insert','update','remove','findById','findAll']);
for(const[file,tree]of trees){
  const names=new Map(),namespaces=new Set();
  if(file==='api/db.js')for(const method of methods)names.set(method,method);
  const functions=[];
  walk(tree,n=>{
    if(n.type==='FunctionDeclaration'&&n.id)functions.push({start:n.start,end:n.end,name:n.id.name});
    if(n.type==='VariableDeclarator'&&n.id?.type==='Identifier'&&
      ['ArrowFunctionExpression','FunctionExpression'].includes(n.init?.type))
      functions.push({start:n.init.start,end:n.init.end,name:n.id.name});
    if(n.type==='ImportDeclaration'&&/(?:^|\/)db\.js$/.test(n.source.value))
      for(const s of n.specifiers){
        if(s.type==='ImportNamespaceSpecifier')namespaces.add(s.local.name);
        else if(methods.has(s.imported?.name))names.set(s.local.name,s.imported.name);
      }
    if(n.type==='VariableDeclarator'&&n.id?.type==='ObjectPattern'){
      let value=n.init;if(value?.type==='AwaitExpression')value=value.argument;
      if(value?.type==='CallExpression'&&value.callee.type==='Import'&&
        /(?:^|\/)db\.js$/.test(value.arguments[0]?.value||''))
        for(const p of n.id.properties)if(methods.has(p.key?.name)&&p.value?.name)
          names.set(p.value.name,p.key.name);
    }
    const sql=n.type==='StringLiteral'?n.value:n.type==='TemplateLiteral'&&n.expressions.length===0?n.quasis[0].value.cooked:null;
    if(sql&&/\b(?:CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(sql))schema(sql,file,n.loc.start.line);
  });
  walk(tree,n=>{
    if(n.type!=='CallExpression')return;
    let method,kind;
    if(n.callee.type==='Identifier'&&names.has(n.callee.name)){method=names.get(n.callee.name);kind='imported db wrapper';}
    else if(n.callee.type==='MemberExpression'&&namespaces.has(n.callee.object?.name)&&methods.has(n.callee.property?.name)){
      method=n.callee.property.name;kind='namespace db wrapper';
    }else if(n.callee.type==='MemberExpression'&&n.callee.property?.name==='query'&&
      (/^api\//.test(file)||file==='server.js'||/^(worker|migrations|scripts)\//.test(file))){
      method='query';kind='transaction/pool sink (conservative superset)';
    }
    if(!method)return;
    const arg=n.arguments[0];
    const staticSql=arg?.type==='StringLiteral'||arg?.type==='TemplateLiteral'&&!arg.expressions.length;
    const http=/^api\//.test(file)||file==='server.js';
    let classification='UNRESOLVED',reason='Dynamic SQL/executor argument needs scope-sensitive control/data-flow review.';
    if(['insert','update','remove','findById','findAll'].includes(method)){
      classification='strict identifier operation';reason='Repository helper validates identifiers; values use bindings; findAll ordering restricted by sqlShape.';
    }else if(staticSql){classification='static SQL with separate bindings';
      reason='Exact call has a string literal or interpolation-free template; any value arguments are separate.';
    }else if(!http&&/^(scripts|tests|migrations|worker)\//.test(file)){
      classification='internal tool/worker path; HTTP-unreachable candidate';
      reason='Not an HTTP root. This is a conservative path classification, not proof against reflective imports.';
    }
    const fn=functions.filter(f=>f.start<=n.start&&f.end>=n.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    inventory.push({file,line:n.loc.start.line,column:n.loc.start.column+1,
      function:fn?.name||'module/anonymous callback',method,kind,
      productionHttpScope:http?'conservative reachable API/server root':'not an HTTP root',
      classification,reason,argumentType:arg?.type||'missing',
      expressionTypes:arg?.type==='TemplateLiteral'?arg.expressions.map(e=>e.type):[],
      hasValueArguments:n.arguments.length>1});
  });
  // Inventory first-class escapes as explicit unresolved coverage, not invisible calls.
  walk(tree,n=>{if(n.type==='VariableDeclarator'&&n.init?.type==='Identifier'&&names.has(n.init.name))
    escapes.push({file,line:n.loc.start.line,kind:'first-class db function alias',classification:'UNRESOLVED'});});
}
const schemaStatus=wanted.map(object=>({object,definitions:definitions.filter(d=>d.object===object),
  status:definitions.some(d=>d.object===object&&d.eligible)?'SOURCE FOUND — dependencies/contract review required':'SCHEMA GOVERNANCE BLOCKER'}));
const blocked=schemaStatus.filter(s=>s.status==='SCHEMA GOVERNANCE BLOCKER');
await fs.writeFile(out+'/schema-provenance.json',JSON.stringify({repositoryOnly:true,productionInspected:false,
  filesInspected:files.length,objects:schemaStatus,blocked:blocked.map(x=>x.object),
  parseFailures,arbitraryScaffoldingAccepted:false},null,2));
await fs.writeFile(out+'/sql-caller-inventory.json',JSON.stringify({repositoryOnly:true,filesInspected:files.length,
  inventory,firstClassEscapes:escapes,parseFailures,
  genericExecutorResolved:false,
  coverageLimitations:['Conservative syntax inventory, not complete interprocedural taint proof.',
    'Dynamic property calls, reflective imports, callback/alias propagation and reexports require further review.',
    'Internal tool/worker paths are not claimed unreachable solely from a directory name.']},null,2));
await fs.writeFile(out+'/schema-provenance.md','# Repository schema provenance\n\n'+schemaStatus.map(s=>
  `## ${s.object}\n\n${s.status}\n\n`+s.definitions.map(d=>`- ${d.file}:${d.line} — ${d.provenance}; authoritative candidate: ${d.eligible}\n`).join('')).join('\n')+
  '\nNo runtime field list was converted into invented DDL. Load canonical branches before backend/create_delivery_tables.sql (towns, delivery_distances, online_orders). Load canonical branch_distributor_profit before api/services/linkedReversals.js (stock_linked_reversals). Load users before users.additional_roles. Canonical activity uses migrations/039_canonical_branch_activity_transactions.sql. This scanner reads repository sources only; source presence is not full application schema convergence or database contract certification.\n');
console.log(JSON.stringify({schemaBlockers:blocked.map(s=>s.object),sqlCallSites:inventory.length,
  unresolvedSql:inventory.filter(s=>s.classification==='UNRESOLVED').length,parseFailures:parseFailures.length}));
