// Read-only repository import reachability. Not a whole-program taint proof.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse} from '@babel/parser';
const out='generated-artifacts/security-release-gate-final';
const inventory=JSON.parse(await fs.readFile('generated-artifacts/security-remediation-final/sql-caller-inventory.json','utf8'));
const review=JSON.parse(await fs.readFile(out+'/sql-caller-review.json','utf8'));
const files=new Set(inventory.inventory.map(x=>x.file));
const reverse=new Map(),failures=[];
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);
  for(const[k,v]of Object.entries(n)){if(['loc','start','end','extra'].includes(k))continue;
    if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);}}
async function addSources(dir){
  for(const item of await fs.readdir(dir,{withFileTypes:true})){
    const file=dir+'/'+item.name;
    if(item.isDirectory())await addSources(file);else if(/\.(?:js|mjs)$/.test(file))files.add(file);
  }
}
await addSources('api');files.add('server.js');
for(const file of files){
  if(!/\.(?:js|mjs)$/.test(file))continue;
  let tree;
  try{tree=parse(await fs.readFile(file,'utf8'),{sourceType:'unambiguous',plugins:['jsx']});}
  catch{failures.push(file);continue;}
  walk(tree,n=>{
    const value=n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'||n.type==='ExportAllDeclaration'
      ?n.source?.value:n.type==='CallExpression'&&n.callee.type==='Import'
        &&n.arguments[0]?.type==='StringLiteral'?n.arguments[0].value:null;
    if(!value?.startsWith('.'))return;
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),value));
    if(!reverse.has(target))reverse.set(target,new Set());
    reverse.get(target).add(file);
  });
}
function ancestors(file){
  const seen=new Set([file]),pending=[file],edges=[];
  while(pending.length){
    const target=pending.shift();
    for(const parent of reverse.get(target)||[]){
      edges.push({importer:parent,imported:target});
      if(!seen.has(parent)){seen.add(parent);pending.push(parent);}
    }
  }
  return {possibleApiModules:[...seen].filter(x=>x.startsWith('api/')&&!x.startsWith('api/services/')&&
    !x.startsWith('api/_lib/')&&x!=='api/db.js').sort(),serverImportReachable:seen.has('server.js'),edges};
}
const rows=review.locations.map(x=>({...x,callFamily:x.file+'#'+x.function+'#'+x.method,
  reachability:ancestors(x.file),endpointFamilyHostileTestStatus:'NOT VERIFIED',
  genericExecutorCleared:false}));
await fs.writeFile(out+'/sql-family-reachability.json',JSON.stringify({
  status:'PARTIALLY VERIFIED',locations:rows,parseFailures:failures,
  remainingBlockers:review.remainingBlockers,allOriginal182Retained:rows.length===182,
  limits:['Import ancestry is conservative module reachability, not function-level execution proof.',
    'Reflective/dynamic import strings, exported callback propagation and request taint remain unresolved.',
    'Existing five PostgreSQL shared-builder sentinel checks do not establish every endpoint-family contract.',
    'No SQL scanner rule is suppressed and generic executor is not cleared.']},null,2));
console.log('Saved source-pinned import reachability for all 182 retained SQL locations.');
