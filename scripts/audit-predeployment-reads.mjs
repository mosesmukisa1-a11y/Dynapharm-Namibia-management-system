// Static, conservative GET/HEAD inventory. Does not load application modules,
// connect to a database, invoke handlers, or make HTTP requests.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from '@babel/parser';

const root=process.cwd(), out=path.join(root,'generated-artifacts/sales-stock-integration/predeployment');
fs.mkdirSync(out,{recursive:true});
const cache=new Map();
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const [k,v]of Object.entries(n)){
  if(['loc','start','end','extra'].includes(k))continue;
  if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v&&typeof v==='object')walk(v,fn);
}}
function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const text=fs.readFileSync(file,'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});
  const info={file,text,ast,functions:new Map(),imports:new Map(),constants:new Map()};
  cache.set(file,info);
  walk(ast,n=>{
    if(n.type==='FunctionDeclaration'&&n.id)info.functions.set(n.id.name,n);
    if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'){
      if(['ArrowFunctionExpression','FunctionExpression'].includes(n.init?.type))info.functions.set(n.id.name,n.init);
      else if(n.init)info.constants.set(n.id.name,n.init);
    }
    if(n.type==='ImportDeclaration'&&n.source.value.startsWith('.'))for(const s of n.specifiers)
      info.imports.set(s.local.name,{module:n.source.value,name:s.imported?.name||'default'});
    if(n.type==='VariableDeclarator'&&n.id.type==='ObjectPattern'){
      let v=n.init;if(v?.type==='AwaitExpression')v=v.argument;
      if(v?.type==='CallExpression'&&v.callee.type==='Import'&&v.arguments[0]?.type==='StringLiteral')
        for(const p of n.id.properties)if(p.key?.name&&p.value?.name)
          info.imports.set(p.value.name,{module:v.arguments[0].value,name:p.key.name});
    }
  });return info;
}
function value(n,info,seen=new Set()){
  if(!n)return null;
  if(n.type==='StringLiteral'||n.type==='BooleanLiteral')return n.value;
  if(n.type==='TemplateLiteral')return n.quasis.map((q,i)=>q.value.cooked+
    (i<n.expressions.length?(value(n.expressions[i],info,new Set(seen))??
      '{'+info.text.slice(n.expressions[i].start,n.expressions[i].end)+'}'):'')).join('');
  if(n.type==='BinaryExpression'&&n.operator==='+'){
    const a=value(n.left,info,seen),b=value(n.right,info,seen);return a!==null?String(a)+(b??'{dynamic}'):null;
  }
  if(n.type==='Identifier'&&!seen.has(n.name)&&info.constants.has(n.name)){
    seen.add(n.name);return value(info.constants.get(n.name),info,seen);
  }return null;
}
function methodCondition(n,info,method){
  if(!n)return null;
  const raw=info.text.slice(n.start,n.end).replaceAll(' ','');
  if(/^(req|request)\.method$/.test(raw))return method;
  if(n.type==='Identifier'&&info.constants.has(n.name)&&
    /\b(req|request)\.method\b/.test(info.text.slice(info.constants.get(n.name).start,info.constants.get(n.name).end)))
    return method;
  if(n.type==='StringLiteral')return n.value;
  if(n.type==='UnaryExpression'&&n.operator==='!'){const v=methodCondition(n.argument,info,method);return v===null?null:!v;}
  if(n.type==='BinaryExpression'&&['===','==','!==','!='].includes(n.operator)){
    const a=methodCondition(n.left,info,method),b=methodCondition(n.right,info,method);
    if(a!==null&&b!==null)return n.operator.includes('!')?a!==b:a===b;
  }
  if(n.type==='LogicalExpression'){
    const a=methodCondition(n.left,info,method),b=methodCondition(n.right,info,method);
    if(n.operator==='&&'){if(a===false||b===false)return false;if(a===true&&b===true)return true;}
    if(n.operator==='||'){if(a===true||b===true)return true;if(a===false&&b===false)return false;}
  }
  if(n.type==='CallExpression'&&n.callee.property?.name==='includes'&&n.callee.object.type==='ArrayExpression'){
    const target=methodCondition(n.arguments[0],info,method);
    if(target!==null)return n.callee.object.elements.map(x=>value(x,info)).includes(target);
  }
  return null;
}
function resolveModule(info,spec){
  let f=path.resolve(path.dirname(info.file),spec);
  if(fs.existsSync(f)&&fs.statSync(f).isFile())return f;
  for(const suffix of ['.js','.jsx','/index.js'])if(fs.existsSync(f+suffix))return f+suffix;
  return null;
}
const server=load('server.js'),inline=[];
walk(server.ast,n=>{
  if(n.type==='CallExpression'&&n.callee.object?.name==='app'&&n.callee.property?.name==='get'){
    const url=value(n.arguments[0],server);
    if(typeof url==='string')inline.push({url,handlers:n.arguments.slice(1)});
  }
});
function analyze(file,node,method='GET'){
  const issues=[],visited=new Set(),sources=new Set();
  const issue=(kind,info,n,detail)=>issues.push({kind,source:path.relative(root,info.file),
    line:n.loc?.start.line,detail});
  function visit(info,n,depth=0){
    if(!n||typeof n!=='object')return;
    if(depth>35){issue('Unknown',info,n,'dependency depth bound');return;}
    if(n.type==='IfStatement'){
      const c=methodCondition(n.test,info,method);
      // Existing automatic daily price refresh is explicitly disabled in code-only.
      if(info.file===server.file&&info.text.slice(n.test.start,n.test.end).includes('!startupPolicy.writesAllowed'))return;
      if(c!==false)visit(info,n.consequent,depth);
      if(c!==true&&n.alternate)visit(info,n.alternate,depth);
      return;
    }
    if(n.type==='ConditionalExpression'){
      const c=methodCondition(n.test,info,method);
      if(c!==false)visit(info,n.consequent,depth);
      if(c!==true)visit(info,n.alternate,depth);return;
    }
    if(n.type==='SwitchStatement'&&methodCondition(n.discriminant,info,method)===method){
      let active=false;for(const c of n.cases){if(c.test?.value===method)active=true;
        if(active){for(const s of c.consequent)visit(info,s,depth);
          if(c.consequent.some(s=>['BreakStatement','ReturnStatement','ThrowStatement'].includes(s.type)))break;}}
      return;
    }
    if(n.type==='CallExpression'){
      const name=n.callee.name||n.callee.property?.name;
      if(['query','getOne','getMany'].includes(name)){
        const sql=value(n.arguments[0],info);
        if(!sql)issue('Unknown',info,n,'dynamic SQL not statically resolved');
        else if(/\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|VIEW|INDEX|TYPE|SCHEMA)|\bCREATE\s+OR\s+REPLACE/i.test(sql))
          issue('May seed/create schema',info,n,'DDL reachable from read handler');
        else if(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i.test(sql))
          issue(/\b(last_seen|last_login|audit_log|access_log)\b/i.test(sql)?'Writes audit/access timestamp':'Unknown',
            info,n,'SQL write reachable (possibly business/account mutation); excluded, not assumed harmless');
        else if(/pg_(?:try_)?advisory/i.test(sql))issue('Unknown',info,n,'advisory coordination is not allowlisted');
        else if(!/^\s*(SELECT|WITH)\b/i.test(sql))issue('Unknown',info,n,'non-SELECT SQL/transaction coordination');
      }else if(['writeFile','writeFileSync','unlink','unlinkSync','appendFile','mkdir','mkdirSync'].includes(name))
        issue('Unknown',info,n,'filesystem mutation reachable');
      else if(/activateDuePrices|applyPendingPrice/.test(name))issue('May activate price changes',info,n,name);
      else if(/notify|enqueue|logAction|createNotification/i.test(name))issue('May enqueue notification/request',info,n,name);
      else if(name==='fetch'||name==='proxyFetch')issue('Unknown',info,n,'external/dynamic HTTP dependency');
      else if(info.functions.has(name)){
        const key=info.file+':'+name+':'+method;if(!visited.has(key)){visited.add(key);visit(info,info.functions.get(name).body,depth+1);}
      }else if(info.imports.has(name)||info.imports.has(n.callee.object?.name)){
        const namespace=info.imports.has(n.callee.object?.name);
        const imp=info.imports.get(namespace?n.callee.object.name:name),f=resolveModule(info,imp.module);
        // The DB wrapper only submits the SQL already inspected above. Do not
        // confuse its reusable transaction-writing helpers with each read call.
        if(f&& !f.endsWith('/api/db.js')){
          const target=load(f);sources.add(path.relative(root,f));
          const data=target.constants.get(imp.name);
          const collection=data&&(data.type==='ArrayExpression'||
            (data.type==='NewExpression'&&data.callee.name==='Set')||
            (data.type==='CallExpression'&&data.callee.object?.name==='Object'&&data.callee.property?.name==='freeze'));
          if(namespace&&collection&&['has','includes','some','every','map','filter','forEach'].includes(name)){
            for(const arg of n.arguments)visit(info,arg,depth);return;
          }
          let fn=target.functions.get(namespace?name:imp.name);
          if(!fn&&imp.name==='default'){const exp=target.ast.program.body.find(x=>x.type==='ExportDefaultDeclaration');fn=exp?.declaration;}
          if(fn?.body){const key=f+':'+imp.name+':'+method;if(!visited.has(key)){visited.add(key);visit(target,fn.body,depth+1);}}
          else issue('Unknown',info,n,'imported helper unresolved: '+name);
        }
      }else if(/ensure.*(?:Schema|Table)|init.*Table|seed|repair|rebuild/i.test(name||''))
        issue('May seed/create schema',info,n,'unresolved setup/repair helper: '+name);
    }
    for(const [k,v]of Object.entries(n)){if(['loc','extra','start','end','callee'].includes(k))continue;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)&&k==='body'){
        visit(info,v,depth);continue;
      }
      if(Array.isArray(v))v.forEach(x=>visit(info,x,depth));else if(v&&typeof v==='object')visit(info,v,depth);
    }
  }
  const info=load(file);sources.add(path.relative(root,info.file));visit(info,node);
  return {issues:[...new Map(issues.map(x=>[JSON.stringify(x),x])).values()],sources:[...sources]};
}

const clientFiles=new Set([
  ...['Branch','Finance','GM','Director','MIS','Stock'].map(x=>`client/src/pages/portals/${x}Portal.jsx`),
  'client/src/components/DailySalesCard.jsx','client/src/lib/authorizedBranchReads.js',
  'client/src/contexts/AuthContext.jsx','client/src/App.jsx',
]);
function directoryFiles(dir){if(!fs.existsSync(dir))return;for(const f of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,f.name);if(f.isDirectory())directoryFiles(p);else if(/\.(jsx?|tsx?)$/.test(p)&&!/\.(test|spec)\./.test(p))clientFiles.add(p);
}}
directoryFiles('client/src/components/stock');
// Follow local imports, including shared request wrappers, providers and hooks.
// This deliberately over-approximates inactive tabs instead of silently omitting
// API calls hidden behind a wrapper method.
for(const file of clientFiles){
  if(!fs.existsSync(file)||!/\.(jsx?|tsx?)$/.test(file))continue;
  const info=load(file);
  for(const imp of info.imports.values()){
    const f=resolveModule(info,imp.module);
    if(f&&f.startsWith(path.join(root,'client'))&&/\.(jsx?|tsx?)$/.test(f))
      clientFiles.add(path.relative(root,f));
  }
}
const requests=[];
for(const file of clientFiles){if(!fs.existsSync(file))continue;const info=load(file);
  walk(info.ast,n=>{if(n.type!=='CallExpression')return;
    if((n.callee.object?.name==='api'&&n.callee.property?.name==='get')||
      ['fetch','request','apiFetch','fetchWithAuth'].includes(n.callee.name)){
      const endpoint=value(n.arguments[0],info);
      if(n.arguments[1]&&/\b(POST|PUT|PATCH|DELETE)\b/.test(info.text.slice(n.arguments[1].start,n.arguments[1].end)))return;
      requests.push({endpoint:typeof endpoint==='string'?endpoint:null,source:file,line:n.loc.start.line,
        unresolved:endpoint===null?info.text.slice(n.arguments[0]?.start||0,n.arguments[0]?.end||0).slice(0,100):undefined});
    }
  });
}
// Explicit shared-prop/resource-map values that are not literals at api.get().
for(const endpoint of ['/gm/daily-sales','/branch/daily-sales','/branch/walkin-sales',
  '/branch/deposits','/branch/expenses','/health','/version','/stock-batches','/branch/stock-summary',
  '/gm/summary','/gm/warehouses/summary','/finance/summary','/finance/branches/summary',
  '/director/summary','/mis/summary','/stock/current-overview','/stock/valuation',
  '/stock/cost-report','/stock/ai-reorder'])
  requests.push({endpoint,source:'shared resource/endpoint prop or required portal/Stock route'});
const middleware=[];
walk(server.ast,n=>{
  if(n.type==='CallExpression'&&n.callee.object?.name==='app'&&n.callee.property?.name==='use'){
    const h=n.arguments.filter(x=>['ArrowFunctionExpression','FunctionExpression'].includes(x.type));
    for(const fn of h) {
      const text=server.text.slice(fn.start,fn.end);
      if(text.includes('if (!startupPolicy.writesAllowed) return next();'))continue;
      middleware.push(analyze(server.file,fn.body));
    }
  }
});
const middlewareIssues=middleware.flatMap(x=>x.issues);
const audited=[];
for(const entry of requests){
  if(!entry.endpoint||!entry.endpoint.startsWith('/')){audited.push({...entry,classification:'Unknown',issues:[{detail:'dynamic endpoint; no production call authorized'}]});continue;}
  const url='/api'+entry.endpoint.replace(/^\/api/,'').split('?')[0];
  if(url.includes('{')){audited.push({...entry,url,classification:'Unknown',issues:[{detail:'dynamic path identity'}]});continue;}
  const direct=inline.find(r=>r.url===url);
  let result;
  if(direct){const combined=direct.handlers.map(n=>analyze(server.file,n));
    result={sources:[...new Set(combined.flatMap(r=>r.sources))],issues:combined.flatMap(r=>r.issues)};
  }else{
    const relative=url.replace(/^\/api\//,''),file=[`api/${relative}.js`,`api/${relative}/index.js`].find(f=>fs.existsSync(f));
    if(!file)result={issues:[{kind:'Unknown',detail:'handler mapping not resolved'}],sources:[]};
    else{const info=load(file),exp=info.ast.program.body.find(n=>n.type==='ExportDefaultDeclaration');
      let node=exp?.declaration;if(node?.type==='Identifier')node=info.functions.get(node.name);
      result=node?analyze(file,node.body||node):{issues:[{kind:'Unknown',detail:'entrypoint unresolved'}],sources:[file]};
    }
  }
  const kinds=[...new Set(result.issues.map(i=>i.kind||'Unknown'))];
  audited.push({...entry,url,classification:kinds.length?kinds.join('; '):'Read-only',...result});
}
const unique=[...new Map(audited.map(x=>[`${x.source}:${x.line}:${x.endpoint}`,x])).values()];
const allow=[...new Set(unique.filter(x=>x.classification==='Read-only').map(x=>x.url))].sort();
const automaticPriceGuard=server.text.includes('if (!startupPolicy.writesAllowed) return next();');
const result={recordedAt:new Date().toISOString(),method:'GET; HEAD uses the same Express GET path where supported',
  mode:'code-only',automaticDailyPriceActivationDisabled:automaticPriceGuard,
  globalMiddlewareIssues:middlewareIssues,
  coverage:'Conservative union of portal and Stock-component GET sites; inactive tabs may be included. Dynamic unresolved paths are explicitly NOT authorized.',
  requests:unique,allowlist:allow};
fs.writeFileSync(path.join(out,'smoke-request-audit.json'),JSON.stringify(result,null,2));
fs.writeFileSync(path.join(out,'safe-smoke-allowlist.json'),JSON.stringify({mode:'code-only',
  productionCallsAuthorized:false,automaticPriceGuard,paths:allow,
  methodsByPath:Object.fromEntries(allow.map(p=>[p,p==='/api/health'?['GET','HEAD']:['GET']])),
  globalMiddlewareIssues:middlewareIssues,
  rule:'GET only unless HEAD explicitly listed; exact known path, explicit required branch/date scope; unresolved/write-capable paths forbidden; no calls if global middleware remains unresolved'},null,2));
fs.writeFileSync(path.join(out,'smoke-request-audit.md'),'# Static smoke request audit\n\nNo handler/production endpoint was invoked. Unknown or write-capable dependencies are excluded. This is a conservative source-site inventory, not browser runtime coverage.\n\n|Request/site|Classification|Evidence / restriction|\n|---|---|---|\n'+unique.map(x=>`|${x.endpoint||x.unresolved||'(dynamic)'} — ${x.source}:${x.line||''}|${x.classification}|${x.issues.map(i=>`${i.source||''}:${i.line||''} ${i.detail}`).join('; ').replaceAll('|',' / ')||x.sources.join(', ')}|`).join('\n')+'\n');
console.log(JSON.stringify({requestSites:unique.length,allowlistedPaths:allow.length,
  restrictedSites:unique.filter(x=>x.classification!=='Read-only').length,automaticPriceGuard}));
