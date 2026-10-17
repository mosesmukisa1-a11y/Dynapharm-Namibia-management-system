// Offline test-source migration only. No database, environment lookup or runtime
// SQL translation. Application imports keep pointing at the strict real API.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generatorModule from '@babel/generator';
import * as t from '@babel/types';
import {databaseSuites} from '../tests/helpers/database-suites.js';
const traverse=traverseModule.default||traverseModule,generate=generatorModule.default||generatorModule;
const base='generated-artifacts/sql-runtime-enforcement-final',catalog={},files=[],unresolved=[],fileInputs=[],forwarders=[];
const digest=x=>createHash('sha256').update(x).digest('hex');
for(const file of databaseSuites){
  const source=await fs.readFile(file,'utf8'),ast=parse(source,{sourceType:'module'});
  const imports=new Map(),transactionNames=new Set(),params=new Set(),aliases=new Map();
  let changed=false,needsStatement=false;
  traverse(ast,{ImportDeclaration(p){
    if(!/\/api\/db\.js$/.test(p.node.source.value))return;
    for(const item of p.node.specifiers){
      if(!t.isImportSpecifier(item))continue;
      const name=item.imported.name;
      if(['query','getOne','getMany'].includes(name))imports.set(item.local.name,name);
      if(name==='withTransaction'||name==='withRequestTransaction')transactionNames.add(item.local.name);
    }
  }});
  const fixedMigrationSources={
    'tests/stock-request-migration.spec.js:12':async()=>(await fs.readFile('migrations/002_create_shared_tables.sql','utf8'))
      .match(/CREATE TABLE IF NOT EXISTS stock_requests \([\s\S]*?\n\);/)[0].replace('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE'),
    'tests/stock-request-migration.spec.js:16':async()=>fs.readFile('migrations/031_stock_request_audit_fields.sql','utf8'),
    'tests/manual-price-control.spec.js:46':async()=>fs.readFile('migrations/027_price_import_identity.sql','utf8'),
    'tests/manual-price-control.spec.js:48':async()=>fs.readFile('migrations/035_manual_price_control.sql','utf8'),
  };
  const fixedInputs=new Map();
  for(const [key,load]of Object.entries(fixedMigrationSources))if(key.startsWith(file+':')){
    const text=await load();fixedInputs.set(key,text);fileInputs.push({source:key,sha256:digest(text)});
  }
  traverse(ast,{CallExpression(p){
    if(!p.get('callee').isIdentifier()||!transactionNames.has(p.node.callee.name))return;
    const fn=p.get('arguments.0');
    if((fn?.isArrowFunctionExpression()||fn?.isFunctionExpression())&&fn.node.params[0])params.add(fn.node.params[0]);
  }});
  function inTransaction(p){
    return !!p.findParent(x=>(x.isArrowFunctionExpression()||x.isFunctionExpression())&&
      x.parentPath.isCallExpression()&&x.parentPath.get('callee').isIdentifier()&&
      transactionNames.has(x.parentPath.node.callee.name));
  }
  traverse(ast,{CallExpression(p){
    const callee=p.get('callee');let strict=false;
    if(callee.isMemberExpression()&&!callee.node.computed&&callee.node.property.name==='query'&&
      callee.get('object').isIdentifier()){
      const b=p.scope.getBinding(callee.node.object.name);strict=!!b&&params.has(b.identifier);
    }else if(callee.isIdentifier()&&imports.has(callee.node.name)&&inTransaction(p)){
      const original=imports.get(callee.node.name),alias='__owned_app_'+original;
      aliases.set(alias,original);callee.replaceWith(t.identifier(alias));strict=true;
    }
    if(!strict)return;
    const first=p.node.arguments[0],text=fixedInputs.get(file+':'+p.node.loc.start.line)??(t.isStringLiteral(first)?first.value:
      t.isTemplateLiteral(first)&&first.expressions.length===0?first.quasis[0].value.cooked:null);
    if(text===null){
      const binding=t.isIdentifier(first)?p.scope.getBinding(first.name):null;
      if(binding?.kind==='param'){forwarders.push({file,line:p.node.loc.start.line,kind:'descriptor-forwarder'});return;}
      unresolved.push({file,line:p.node.loc.start.line,kind:'transaction-fixture-needs-static-descriptor'});return;
    }
    const id='owned-tests/'+file+':'+p.node.loc.start.line+':'+Object.keys(catalog).length;
    catalog[id]={chunks:[text],slots:[],kind:'statement',group:file,
      contexts:['service','request','transaction','startup','worker'],
      operation:/^\s*(?:SELECT|WITH)\b/i.test(text)?'read':
        /^\s*(?:CREATE|ALTER|DROP)\b/i.test(text)?'schema':
          /^\s*(?:SET|BEGIN|COMMIT|ROLLBACK)\b/i.test(text)?'control':'write'};
    const values=p.node.arguments[1]||t.arrayExpression([]);
    p.node.arguments=[t.callExpression(t.identifier('__ownedStatement'),[t.stringLiteral(id),values])];
    changed=true;needsStatement=true;
  }});
  traverse(ast,{ImportDeclaration(p){
    if(!/\/api\/db\.js$/.test(p.node.source.value))return;
    const tool=p.node.specifiers.filter(x=>t.isImportSpecifier(x)&&imports.has(x.local.name));
    if(!tool.length)return;
    const remaining=p.node.specifiers.filter(x=>!tool.includes(x));
    const replacement=t.importDeclaration(tool,t.stringLiteral('./helpers/owned-raw-database.js'));
    if(remaining.length){p.node.specifiers=remaining;p.insertAfter(replacement);}else p.replaceWith(replacement);
    changed=true;
  }});
  if(aliases.size)ast.program.body.unshift(t.importDeclaration([...aliases].map(([local,name])=>
    t.importSpecifier(t.identifier(local),t.identifier(name))),t.stringLiteral('../api/db.js')));
  if(needsStatement)ast.program.body.unshift(t.importDeclaration([
    t.importSpecifier(t.identifier('__ownedStatement'),t.identifier('ownedStatement'))],
    t.stringLiteral('./helpers/owned-statement.js')));
  if(changed){
    const code=generate(ast,{retainLines:true,comments:true},source).code+'\n',candidate=base+'/test-source-candidates/'+file;
    await fs.mkdir(path.dirname(candidate),{recursive:true});await fs.writeFile(candidate,code);
    files.push({file,candidate,beforeSha256:digest(source),afterSha256:digest(code)});
  }
}
const catalogFile='tests/helpers/owned-static-sql-catalog.js',catalogCandidate=base+'/test-source-candidates/'+catalogFile;
await fs.mkdir(path.dirname(catalogCandidate),{recursive:true});
const catalogSource='// Fixed isolated fixture statements. NEVER imported by production modules.\nexport default '+JSON.stringify(catalog,null,2)+';\n';
await fs.writeFile(catalogCandidate,catalogSource);
files.push({file:catalogFile,candidate:catalogCandidate,beforeSha256:null,afterSha256:digest(catalogSource)});
await fs.writeFile(base+'/test-source-migration-manifest.json',JSON.stringify({files,unresolved,forwarders,fileInputs,registeredFixtures:Object.keys(catalog).length},null,2));
console.log(JSON.stringify({files:files.length,registeredFixtures:Object.keys(catalog).length,unresolved}));
