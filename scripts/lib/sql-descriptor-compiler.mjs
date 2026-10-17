// Closed source-to-descriptor translation. No eval, request data, DB, environment
// lookup, arbitrary file selection, or SQL-text admission at execution time.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import generatorModule from '@babel/generator';
import * as t from '@babel/types';
const traverse=traverseModule.default||traverseModule,generate=generatorModule.default||generatorModule;
const hash=v=>createHash('sha256').update(v).digest('hex');
const sinkNames=new Set(['query','getOne','getMany','read','readMany','runQuery','queryFn','qry','reader']);
const skip=new Set(['api/db.js','api/services/queryDescriptors.js','api/testDatabaseGuard.js']);
const joinNames=Object.freeze({'':'empty',' AND ':'and',' OR ':'or',', ':'comma',',':'compactComma',' ':'space'});
export async function compileSqlDescriptors(root){
  const modules=new Map(),catalog=Object.create(null),issues=[],locations=[],sources=new Map();
  async function load(file){
    if(sources.has(file))return sources.get(file);
    const source=await fs.readFile(path.join(root,file),'utf8');
    const ast=parse(source,{sourceType:'module',plugins:['jsx']});
    let program;traverse(ast,{Program(p){program=p;p.stop();}});
    const result={file,source,ast,program,sha256:hash(source)};sources.set(file,result);return result;
  }
  function resolve(file,name){return path.posix.normalize(path.posix.join(path.posix.dirname(file),name));}
  const staticStack=new Set();
  async function literal(p,m){
    if(!p?.node)return undefined;
    const key=m.file+':'+p.node.start;if(staticStack.has(key))return undefined;
    staticStack.add(key);
    try{
      if(p.isStringLiteral()||p.isNumericLiteral())return p.node.value;
      if(p.isTemplateLiteral()){
        let out=p.node.quasis[0].value.cooked;
        for(let i=0;i<p.node.expressions.length;i++){
          const value=await literal(p.get(`expressions.${i}`),m);
          if(value===undefined)return undefined;out+=value+p.node.quasis[i+1].value.cooked;
        }return out;
      }
      if(p.isBinaryExpression({operator:'+'})){
        const a=await literal(p.get('left'),m),b=await literal(p.get('right'),m);
        if(a!==undefined&&b!==undefined)return a+b;
      }
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);if(!b)return undefined;
        if(b.path.isImportSpecifier()){
          const declaration=b.path.parentPath,from=declaration.node.source.value;
          if(!from.startsWith('.'))return undefined;
          const other=await load(resolve(m.file,from));
          const imported=b.path.node.imported.name;
          const binding=other.program.scope.getBinding(imported);
          if(binding?.constant&&binding.path.isVariableDeclarator())return literal(binding.path.get('init'),other);
        }
        if(b.constant&&b.path.isVariableDeclarator())return literal(b.path.get('init'),m);
      }
      // Never fold calls: even a constant-returning helper or its arguments may
      // validate authority, throw, or change transaction state.
    }finally{staticStack.delete(key);}
    return undefined;
  }
  async function walk(dir){
    const entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});const found=[];
    for(const e of entries){
      if(e.isDirectory())found.push(...await walk(dir+'/'+e.name));
      else if(e.isFile()&&/\.(?:js|mjs)$/.test(e.name)&&!e.name.endsWith('.test.js'))found.push(dir+'/'+e.name);
    }return found;
  }
  const files=[...await walk('api'),'server.js',...await walk('worker')];
  for(const file of files){
    if(skip.has(file))continue;
    const m=await load(file),transformed=new WeakSet(),arrayDone=new Set(),active=new Set();
    let serial=0,used=false;
    const helper=name=>t.identifier('__qd_'+name);
    function entry(chunks,slots,p){
      used=true;const id=file+':'+(p.node.loc?.start.line||0)+':'+(serial++);
      const text=chunks.join(' ');
      const operation=/^\s*(CREATE|ALTER|DROP|DO|TRUNCATE)\b/i.test(text)?'schema':
        /\b(INSERT|UPDATE|DELETE)\b/i.test(text)?'write':/^\s*(BEGIN|COMMIT|ROLLBACK|SET|LOCK)\b/i.test(text)?'control':'read';
      const fn=p.getFunctionParent();
      catalog[id]={chunks,slots,operation,contexts:operation==='schema'?['startup']:
        ['service','request','transaction','startup','worker'],
        group:file+':'+(fn?.node.start??'module'),
        kind:/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|DO|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SET|LOCK)\b/i.test(text)?'statement':'fragment'};
      return id;
    }
    function fixed(text,p){
      const id=entry([text],[],p);return t.callExpression(helper('registeredPlan'),[t.stringLiteral(id)]);
    }
    async function choices(p){
      if(p.isConditionalExpression()){
        const a=await literal(p.get('consequent'),m),b=await literal(p.get('alternate'),m);
        if(typeof a==='string'&&typeof b==='string')return [...new Set([a,b])];
      }
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);
        if(b?.path.isVariableDeclarator()&&b.path.parentPath.parentPath?.isForOfStatement()){
          let list=b.path.parentPath.parentPath.get('right');
          if(list.isIdentifier()){const d=list.scope.getBinding(list.node.name);if(d?.path.isVariableDeclarator())list=d.path.get('init');}
          if(list.isArrayExpression()){
            const values=await Promise.all(list.get('elements').map(x=>literal(x,m)));
            if(values.every(v=>typeof v==='string'))return [...new Set(values)];
          }
        }
      }
      if(p.isMemberExpression()){
        let obj=p.get('object');
        if(obj.isIdentifier()){
          const b=obj.scope.getBinding(obj.node.name);if(b?.constant&&b.path.isVariableDeclarator())obj=b.path.get('init');
        }
        if(obj.isCallExpression()&&obj.get('callee').matchesPattern('Object.freeze'))obj=obj.get('arguments.0');
        if(obj.isObjectExpression()){
          const values=[];
          for(const prop of obj.get('properties')){
            if(!prop.isObjectProperty()||prop.node.computed)return undefined;
            const v=await literal(prop.get('value'),m);if(typeof v!=='string')return undefined;values.push(v);
          }return [...new Set(values)];
        }
      }
      return undefined;
    }
    async function markArray(p){
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);if(!b?.path.isVariableDeclarator())throw Error('Opaque SQL array');
        if(arrayDone.has(b))return;arrayDone.add(b);
        await markArray(b.path.get('init'));
        for(const ref of [...b.referencePaths]){
          const parent=ref.parentPath;
          if(parent.isMemberExpression()&&!parent.node.computed){
            const property=parent.node.property.name;
            if(property==='length')continue;
            if(property==='join')continue;
            if(property==='push'&&parent.parentPath.isCallExpression()){
              const call=parent.parentPath;
              for(const a of call.get('arguments'))a.replaceWith(await structure(a));
              continue;
            }
          }
          throw Error('SQL array alias or method escape');
        }return;
      }
      if(p.isArrayExpression()){
        for(const e of p.get('elements')){
          if(!e.node||e.isSpreadElement())throw Error('SQL array spread');
          e.replaceWith(await structure(e));
        }return;
      }
      if(p.isCallExpression()&&p.get('callee').isMemberExpression()&&p.node.callee.property.name==='map'){
        const cb=p.get('arguments.0');if(!cb.isArrowFunctionExpression())throw Error('Opaque SQL mapper');
        if(cb.get('body').isBlockStatement()){
          const returns=[];cb.traverse({ReturnStatement(r){if(r.getFunctionParent()===cb)returns.push(r);}});
          for(const r of returns)r.get('argument').replaceWith(await structure(r.get('argument')));
        }else cb.get('body').replaceWith(await structure(cb.get('body')));
        return;
      }
      throw Error('Unsupported SQL array source');
    }
    async function structure(p){
      if(transformed.has(p.node))return p.node;
      const constant=await literal(p,m);
      if(typeof constant==='string')return fixed(constant,p);
      if(p.isTemplateLiteral()){
        const chunks=[p.node.quasis[0].value.cooked],rules=[],args=[];
        for(let i=0;i<p.node.expressions.length;i++){
          const expr=p.get(`expressions.${i}`),value=await literal(expr,m);
          if(typeof value==='string'||typeof value==='number'){
            chunks[chunks.length-1]+=value+p.node.quasis[i+1].value.cooked;continue;
          }
          const finite=await choices(expr);
          if(finite){rules.push({kind:'choice',choices:finite});args.push(expr.node);}
          else if(/\$$/.test(chunks[chunks.length-1])||/\b(LIMIT|OFFSET)\s*$/i.test(chunks[chunks.length-1])){
            rules.push({kind:'integer',min:/\$$/.test(chunks[chunks.length-1])?1:0,max:65535});args.push(expr.node);
          }else{rules.push({kind:'part'});args.push(await structure(expr));}
          chunks.push(p.node.quasis[i+1].value.cooked);
        }
        const id=entry(chunks,rules,p);
        return t.callExpression(helper('registeredPlan'),[t.stringLiteral(id),t.arrayExpression(args)]);
      }
      if(p.isBinaryExpression({operator:'+'}))return t.callExpression(helper('joinPlans'),[
        t.arrayExpression([await structure(p.get('left')),await structure(p.get('right'))]),t.stringLiteral('empty')]);
      if(p.isConditionalExpression())return t.conditionalExpression(p.node.test,await structure(p.get('consequent')),await structure(p.get('alternate')));
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);
        if(!b)throw Error('Unbound SQL structure');
        // Parameters are descriptor-forwarding boundaries, not registration sites.
        if(b.kind==='param')return p.node;
        if(active.has(b))return p.node;active.add(b);
        try{
          if(b.path.isVariableDeclarator()&&b.path.node.init){
            if(b.path.get('id').isObjectPattern()){
              const prop=b.path.get('id.properties').find(x=>x.isObjectProperty()&&
                x.node.value.type==='Identifier'&&x.node.value.name===p.node.name);
              const call=b.path.get('init');
              const fnBinding=call.isCallExpression()&&call.get('callee').isIdentifier()?
                call.scope.getBinding(call.node.callee.name):null;
              const fn=fnBinding?.path.isFunctionDeclaration()?fnBinding.path:
                fnBinding?.path.isVariableDeclarator()?fnBinding.path.get('init'):null;
              if(!prop||!fn?.isFunction())throw Error('Opaque destructured SQL producer');
              const field=prop.node.key.name,returns=[];
              fn.traverse({ReturnStatement(r){if(r.getFunctionParent()===fn)returns.push(r);}});
              for(const r of returns){
                const out=r.get('argument');
                if(!out.isObjectExpression())throw Error('Inconsistent SQL producer return');
                const value=out.get('properties').find(x=>x.isObjectProperty()&&!x.node.computed&&x.node.key.name===field);
                if(!value)throw Error('Missing SQL producer field');
                value.get('value').replaceWith(await structure(value.get('value')));
              }
              return p.node;
            }
            const init=b.path.get('init');init.replaceWith(await structure(init));transformed.add(init.node);
            for(const write of [...b.constantViolations]){
              if(!write.isAssignmentExpression()||!['=','+='].includes(write.node.operator))throw Error('SQL mutation is not finite');
              const rhs=await structure(write.get('right'));
              write.node.right=write.node.operator==='+='?t.callExpression(helper('joinPlans'),[t.arrayExpression([t.identifier(p.node.name),rhs]),t.stringLiteral('empty')]):rhs;
              write.node.operator='=';
            }return p.node;
          }
          if(b.path.isVariableDeclarator()&&b.path.parentPath.parentPath?.isForOfStatement()){
            await markArray(b.path.parentPath.parentPath.get('right'));return p.node;
          }
        }finally{active.delete(b);}
        throw Error('Opaque SQL binding');
      }
      if(p.isCallExpression()){
        const callee=p.get('callee');
        if(callee.isMemberExpression()&&callee.node.property.name==='join'){
          const delimiter=p.node.arguments[0]?.value??'';if(!Object.hasOwn(joinNames,delimiter))throw Error('Unknown SQL delimiter');
          await markArray(callee.get('object'));
          return t.callExpression(helper('joinPlans'),[callee.node.object,t.stringLiteral(joinNames[delimiter])]);
        }
        if(callee.isIdentifier()){
          const b=callee.scope.getBinding(callee.node.name),fn=b?.path.isFunctionDeclaration()?b.path:
            b?.path.isVariableDeclarator()?b.path.get('init'):null;
          if(fn?.isFunction()){
            if(fn.isArrowFunctionExpression()&&!fn.get('body').isBlockStatement())return literal(fn.get('body'),m);
            const returns=[];fn.traverse({ReturnStatement(r){if(r.getFunctionParent()===fn)returns.push(r);}});
            if(returns.length){
              for(const r of returns)r.get('argument').replaceWith(await structure(r.get('argument')));
              return p.node;
            }
          }
        }
      }
      const label=node=>node?.type==='Identifier'?node.name:node?.type==='MemberExpression'?
        label(node.object)+'.'+(node.property.name||'<computed>'):node?.type==='CallExpression'?
        label(node.callee)+'()':node?.type||'<missing>';
      throw Error('Unreviewed SQL construction '+label(p.node));
    }
    const calls=[];
    traverse(m.ast,{CallExpression(p){
      const c=p.node.callee,name=c.type==='Identifier'?c.name:c.type==='MemberExpression'?
        (c.computed?c.property.value:c.property.name):null;
      if(sinkNames.has(name)&&p.node.arguments.length>0&&
        (name==='query'||name==='getOne'||name==='getMany'||c.type==='Identifier'))calls.push(p);
    }});
    for(const p of calls){
      if(!p.node||p.node.callee.type==='Super')continue;
      const first=p.get('arguments.0');
      const origin={file,line:p.node.loc?.start.line,column:p.node.loc?.start.column,sourceSha256:m.sha256};
      try{
        let plan;
        if(first.isMemberExpression()&&!first.node.computed&&first.node.property.name==='text'){
          plan=first.node.object;
        }else plan=await structure(first);
        const callee=p.node.callee;
        const executor=callee.type==='MemberExpression'?t.callExpression(
          t.memberExpression(callee,t.identifier('bind')),[callee.object]):callee;
        const replacement=t.callExpression(helper('executePlan'),[
          executor,plan,p.node.arguments[1]||t.arrayExpression([])]);
        p.replaceWith(replacement);used=true;locations.push({...origin,disposition:'descriptor-call',queryIds:Object.keys(catalog).filter(k=>k.startsWith(file+':'+origin.line+':'))});
      }catch(error){
        issues.push({...origin,reason:error.message});locations.push({...origin,disposition:'BLOCKED',reason:error.message});
      }
    }
    if(used){
      let from=path.posix.relative(path.posix.dirname(file),'api/services/queryDescriptors.js');
      if(!from.startsWith('.'))from='./'+from;
      m.ast.program.body.unshift(t.importDeclaration(['registeredPlan','joinPlans','executePlan'].map(name=>
        t.importSpecifier(helper(name),t.identifier(name))),t.stringLiteral(from)));
    }
    modules.set(path.resolve(root,file),{source:generate(m.ast,{retainLines:true,comments:true},m.source).code,sourceSha256:m.sha256});
  }
  return {modules,catalog,issues,locations};
}
