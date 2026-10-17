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
const skip=new Set(['api/db.js','api/services/queryDescriptors.js','api/services/registeredSqlCatalog.js','api/testDatabaseGuard.js']);
const joinNames=Object.freeze({'':'empty',' AND ':'and',' OR ':'or',', ':'comma',',':'compactComma',' ':'space'});
function sqlMetadata(text){
  // Lexical classification only, NOT SQL admission. Text is already fixed in
  // the repository. Ignore comments/quoted strings and nested CTE bodies.
  const tokens=[];let depth=0;
  for(let i=0;i<text.length;){
    if(text.startsWith('--',i)){const end=text.indexOf('\n',i);i=end<0?text.length:end+1;continue;}
    if(text.startsWith('/*',i)){const end=text.indexOf('*/',i+2);i=end<0?text.length:end+2;continue;}
    if(text[i]==="'"||text[i]==='"'){
      const quote=text[i++];while(i<text.length){
        if(text[i]===quote){if(text[i+1]===quote){i+=2;continue;}i++;break;}i++;
      }continue;
    }
    const dollar=text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
    if(dollar){const end=text.indexOf(dollar[0],i+dollar[0].length);i=end<0?text.length:end+dollar[0].length;continue;}
    if(text[i]==='('){depth++;i++;continue;}if(text[i]===')'){depth--;i++;continue;}
    const word=text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if(word){if(depth===0)tokens.push(word[0].toUpperCase());i+=word[0].length;}else i++;
  }
  const first=tokens[0],root=first==='WITH'?tokens.slice(1).find(x=>['SELECT','INSERT','UPDATE','DELETE'].includes(x)):first;
  const kind=['SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','DO','TRUNCATE','BEGIN','COMMIT','ROLLBACK','SET','LOCK'].includes(root)?'statement':'fragment';
  const operation=['CREATE','ALTER','DROP','DO','TRUNCATE'].includes(root)?'schema':
    ['INSERT','UPDATE','DELETE'].includes(root)?'write':
    ['BEGIN','COMMIT','ROLLBACK','SET','LOCK'].includes(root)?'control':'read';
  return {kind,operation};
}
export async function compileSqlDescriptors(root){
  const modules=new Map(),catalog=Object.create(null),issues=[],locations=[],sources=new Map(),fileInputs=[];
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
      if(p.isNullLiteral())return null;
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
      if(p.isMemberExpression()&&p.get('object').isAwaitExpression()){
        const arg=p.get('object.argument');
        if(arg.isCallExpression()&&arg.node.callee.type==='Import'&&arg.node.arguments[0]?.type==='StringLiteral'){
          const other=await load(resolve(m.file,arg.node.arguments[0].value));
          const name=p.node.computed?p.node.property.value:p.node.property.name;
          const b=other.program.scope.getBinding(name);
          if(b?.constant&&b.path.isVariableDeclarator())return literal(b.path.get('init'),other);
        }
      }
      if(p.isAwaitExpression()){
        const call=p.get('argument');
        if(call.isCallExpression()&&call.get('callee').isMemberExpression()&&call.node.callee.property.name==='readFile'){
          const target=call.node.arguments[0];
          if(target?.type==='NewExpression'&&target.callee.name==='URL'&&target.arguments[0]?.type==='StringLiteral'){
            const filename=resolve(m.file,target.arguments[0].value);
            if(!/^migrations\/[A-Za-z0-9_-]+\.sql$/.test(filename))throw Error('SQL file outside approved repository migrations');
            const sql=await fs.readFile(path.join(root,filename),'utf8');
            fileInputs.push({file:filename,sha256:hash(sql),caller:m.file,line:p.node.loc?.start.line});
            return sql;
          }
        }
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
      const {operation,kind}=sqlMetadata(text);
      catalog[id]={chunks,slots,operation,contexts:['service','request','transaction','startup','worker'],
        group:file,
        kind};
      return id;
    }
    function fixed(text,p){
      const id=entry([text],[],p);return t.callExpression(helper('registeredPlan'),[t.stringLiteral(id)]);
    }
    async function choices(p){
      if(p.isConditionalExpression()){
        const a=await literal(p.get('consequent'),m),b=await literal(p.get('alternate'),m);
        if(typeof a==='string'&&typeof b==='string')return [...new Set([a,b])];
        if(a===null)return choices(p.get('alternate'));
        if(b===null)return choices(p.get('consequent'));
      }
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);
        if(b?.constant&&b.path.isVariableDeclarator()&&b.path.node.init&&
          !b.path.parentPath.parentPath?.isForOfStatement())return choices(b.path.get('init'));
        if(b?.path.isVariableDeclarator()&&b.path.parentPath.parentPath?.isForOfStatement()){
          let list=b.path.parentPath.parentPath.get('right');
          if(list.isIdentifier()){const d=list.scope.getBinding(list.node.name);if(d?.path.isVariableDeclarator())list=d.path.get('init');}
          if(list.isArrayExpression()){
            let elements=list.get('elements');
            if(b.path.get('id').isArrayPattern()){
              const index=b.path.node.id.elements.findIndex(n=>n?.name===p.node.name);
              elements=elements.map(x=>x.isArrayExpression()?x.get(`elements.${index}`):x);
            }
            if(b.path.get('id').isObjectPattern()){
              const field=b.path.node.id.properties.find(x=>x.value?.name===p.node.name)?.key.name;
              elements=elements.map(x=>x.isObjectExpression()?x.get('properties').find(v=>v.node.key.name===field)?.get('value'):x);
              if(elements.some(x=>!x))return undefined;
            }
            const values=await Promise.all(elements.map(x=>literal(x,m)));
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
        const property=p.node.computed?p.node.property.value:p.node.property.name;
        if(obj.isConditionalExpression()&&typeof property==='string'){
          async function branchValues(child){
            if(child.isNullLiteral())return [];
            if(child.isConditionalExpression()){
              const a=await branchValues(child.get('consequent')),b=await branchValues(child.get('alternate'));
              return a&&b?[...a,...b]:undefined;
            }
            if(!child.isObjectExpression())return undefined;
            const member=child.get('properties').find(x=>x.isObjectProperty()&&!x.node.computed&&
              (x.node.key.name??x.node.key.value)===property);
            if(!member)return undefined;
            const value=await literal(member.get('value'),m);
            return typeof value==='string'?[value]:undefined;
          }
          const values=await branchValues(obj);
          if(values?.length)return [...new Set(values)];
        }
        if(obj.isIdentifier()){
          const b=obj.scope.getBinding(obj.node.name);
          if(b?.path.isVariableDeclarator()&&b.path.parentPath.parentPath?.isForOfStatement()){
            let list=b.path.parentPath.parentPath.get('right');
            if(list.isIdentifier())list=list.scope.getBinding(list.node.name)?.path.get('init');
            if(list?.isArrayExpression()){
              const values=[];
              for(const item of list.get('elements')){
                if(!item.isObjectExpression())return undefined;
                const field=item.get('properties').find(x=>x.isObjectProperty()&&x.node.key.name===property);
                const value=field&&await literal(field.get('value'),m);
                if(typeof value!=='string')return undefined;values.push(value);
              }
              return [...new Set(values)];
            }
          }
        }
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
            if(property==='findIndex'||property==='map'||property==='filter'||property==='slice')continue;
            if(['push','unshift'].includes(property)&&parent.parentPath.isCallExpression()){
              const call=parent.parentPath;
              for(const a of call.get('arguments'))a.replaceWith(await structure(a));
              continue;
            }
          }
          if(parent.isForOfStatement()&&parent.node.right===ref.node)continue;
          if(parent.isCallExpression()&&parent.get('callee').isIdentifier()){
            const target=parent.scope.getBinding(parent.node.callee.name);
            const fn=target?.path.isFunctionDeclaration()?target.path:target?.path.isVariableDeclarator()?target.path.get('init'):null;
            const index=parent.node.arguments.indexOf(ref.node),param=fn?.node.params[index];
            const binding=param?.type==='Identifier'?fn.scope.getBinding(param.name):null;
            if(!binding)throw Error('Opaque SQL array recipient');
            for(const use of binding.referencePaths){
              const member=use.parentPath;
              if(!member.isMemberExpression()||!['push','unshift'].includes(member.node.property.name)||!member.parentPath.isCallExpression())
                throw Error('SQL array parameter escape');
              for(const arg of member.parentPath.get('arguments'))arg.replaceWith(await structure(arg));
            }
            continue;
          }
          throw Error('SQL array alias or method escape');
        }return;
      }
      if(p.isArrayExpression()){
        for(const e of p.get('elements')){
          if(e.isSpreadElement()){
            const value=e.get('argument');
            if(value.isConditionalExpression()){
              await markArray(value.get('consequent'));await markArray(value.get('alternate'));
            }else await markArray(value);
            continue;
          }
          if(!e.node)throw Error('SQL array hole');
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
      if(p.isCallExpression()&&p.get('callee').matchesPattern('Object.keys')){
        const data=p.get('arguments.0');
        const b=data.isIdentifier()?data.scope.getBinding(data.node.name):null;
        const record=b?.constant&&b.path.isVariableDeclarator()?b.path.get('init'):data;
        if(!record.isObjectExpression()||record.node.properties.some(x=>x.type!=='ObjectProperty'||x.computed))throw Error('Unknown SQL column record');
        const names=record.node.properties.map(x=>x.key.name||x.key.value);
        if(names.some(x=>typeof x!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)))throw Error('Invalid finite column');
        const id=entry(['',''],[{kind:'choice',choices:names}],p);
        const original=t.cloneNode(p.node,true);
        p.replaceWith(t.callExpression(helper('columnPlans'),[t.stringLiteral(id),original]));return;
      }
      throw Error('Unsupported SQL array source');
    }
    async function structure(p){
      if(transformed.has(p.node))return p.node;
      if(p.isCallExpression()&&p.get('callee').isIdentifier()&&p.node.callee.name.startsWith('__qd_'))return p.node;
      const constant=await literal(p,m);
      if(typeof constant==='string')return fixed(constant,p);
      if(p.isNumericLiteral()){
        const id=entry(['',''],[{kind:'integer',min:0,max:Number.MAX_SAFE_INTEGER}],p);
        return t.callExpression(helper('registeredPlan'),[t.stringLiteral(id),t.arrayExpression([p.node])]);
      }
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
      if(p.isBinaryExpression({operator:'+'})){
        const left=await literal(p.get('left'),m);
        if(typeof left==='string'&&/\$$/.test(left)){
          const id=entry([left,''],[{kind:'integer',min:1,max:65535}],p);
          return t.callExpression(helper('registeredPlan'),[t.stringLiteral(id),t.arrayExpression([p.node.right])]);
        }
        return t.callExpression(helper('joinPlans'),[
          t.arrayExpression([await structure(p.get('left')),await structure(p.get('right'))]),t.stringLiteral('empty')]);
      }
      if(p.isConditionalExpression())return t.conditionalExpression(p.node.test,await structure(p.get('consequent')),await structure(p.get('alternate')));
      if(p.isIdentifier()){
        const b=p.scope.getBinding(p.node.name);
        if(!b)throw Error('Unbound SQL structure');
        // Parameters are descriptor-forwarding boundaries, not registration sites.
        if(b.kind==='param')return p.node;
        if(active.has(b))return p.node;active.add(b);
        try{
          if(b.path.isVariableDeclarator()&&!b.path.node.init&&b.constantViolations.length){
            for(const assignment of b.constantViolations){
              if(!assignment.isAssignmentExpression({operator:'='}))throw Error('Unbounded SQL assignment');
              assignment.get('right').replaceWith(await structure(assignment.get('right')));
            }
            return p.node;
          }
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
        throw Error('Opaque SQL binding '+p.node.name);
      }
      if(p.isCallExpression()){
        const callee=p.get('callee');
        if(callee.isMemberExpression()&&callee.node.property.name==='join'){
          const delimiter=p.node.arguments[0]?.value??'';if(!Object.hasOwn(joinNames,delimiter))throw Error('Unknown SQL delimiter');
          await markArray(callee.get('object'));
          return t.callExpression(helper('joinPlans'),[callee.node.object,t.stringLiteral(joinNames[delimiter])]);
        }
        if(callee.isMemberExpression()&&callee.node.property.name==='trim'&&p.node.arguments.length===0)
          return t.callExpression(helper('trimPlan'),[await structure(callee.get('object'))]);
        if(callee.isMemberExpression()&&callee.node.property.name==='replaceAll'&&p.node.arguments[0]?.value==='$SEARCH'){
          return t.callExpression(helper('replaceSearchPlaceholder'),[await structure(callee.get('object')),p.node.arguments[1]]);
        }
        if(callee.isIdentifier()){
          const b=callee.scope.getBinding(callee.node.name),fn=b?.path.isFunctionDeclaration()?b.path:
            b?.path.isVariableDeclarator()?b.path.get('init'):null;
          if(b?.path.isImportSpecifier()&&['businessDatePredicate','reportInstantPredicate'].includes(b.path.node.imported.name)){
            const source=b.path.parentPath.node.source.value;
            if(!/\/(?:businessDates|reportDateBounds)\.js$/.test(source))throw Error('Unknown finite date producer');
            return p.node;
          }
          if(b?.path.isImportSpecifier()&&['physicalPrefix','priceReferenceCount','branchSearchPredicate'].includes(b.path.node.imported.name)&&
            b.path.parentPath.node.source.value.endsWith('/queryDescriptors.js')){
            if(['physicalPrefix','branchSearchPredicate'].includes(b.path.node.imported.name))p.get('arguments.0').replaceWith(await structure(p.get('arguments.0')));
            return p.node;
          }
          if(fn?.isFunction()){
            if(fn.isArrowFunctionExpression()&&!fn.get('body').isBlockStatement()){
              fn.get('body').replaceWith(await structure(fn.get('body')));return p.node;
            }
            if(fn.isArrowFunctionExpression()&&!fn.get('body').isBlockStatement())return literal(fn.get('body'),m);
            const returns=[];fn.traverse({ReturnStatement(r){if(r.getFunctionParent()===fn)returns.push(r);}});
            if(returns.length){
              for(const r of returns)r.get('argument').replaceWith(await structure(r.get('argument')));
              return p.node;
            }
          }
        }
      }
      if(p.isMemberExpression()){
        let base=p;
        while(base.isMemberExpression())base=base.get('object');
        const binding=base.isIdentifier()?base.scope.getBinding(base.node.name):null;
        if(binding?.constant&&binding.path.isVariableDeclarator()){
          async function convertMap(node){
            if(transformed.has(node.node))return;
            if(node.isCallExpression()&&node.get('callee').matchesPattern('Object.freeze'))return convertMap(node.get('arguments.0'));
            if(node.isObjectExpression()){
              for(const property of node.get('properties')){
                if(!property.isObjectProperty()||property.node.computed)throw Error('Accessor SQL map');
                await convertMap(property.get('value'));
              }return;
            }
            if(node.isArrayExpression()){
              for(const item of node.get('elements'))await convertMap(item);return;
            }
            node.replaceWith(await structure(node));transformed.add(node.node);
          }
          await convertMap(binding.path.get('init'));return p.node;
        }
      }
      if(p.isAwaitExpression()&&p.get('argument').isCallExpression()){
        const fn=p.get('argument.callee');
        if(fn.isIdentifier({name:'stockReconciliationSnapshotSql'}))return p.node;
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
      const referenced=new Set();
      traverse(m.ast,{Identifier(p){if(p.node.name.startsWith('__qd_'))referenced.add(p.node.name.slice(5));}});
      m.ast.program.body.unshift(t.importDeclaration(['registeredPlan','joinPlans','executePlan','columnPlans','trimPlan','replaceSearchPlaceholder'].filter(name=>referenced.has(name)).map(name=>
        t.importSpecifier(helper(name),t.identifier(name))),t.stringLiteral(from)));
    }
    modules.set(path.resolve(root,file),{source:used?generate(m.ast,{retainLines:true,comments:true},m.source).code:m.source.trimEnd(),sourceSha256:m.sha256});
  }
  return {modules,catalog,issues,locations,fileInputs};
}
