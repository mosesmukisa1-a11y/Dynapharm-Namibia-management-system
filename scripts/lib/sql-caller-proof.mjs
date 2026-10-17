// Conservative syntax proofs, not an interprocedural/permission audit.
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const yes=reason=>({safe:true,reason}),no=reason=>({safe:false,reason});
function nativeLocalArray(path){
  if(!path?.isIdentifier())return false;
  const binding=path.scope.getBinding(path.node.name);
  if(!binding?.constant||!binding.path.isVariableDeclarator())return false;
  const init=binding.path.get('init');
  return init.isArrayExpression()||(init.isCallExpression()&&init.get('callee').isMemberExpression()
    &&init.node.callee.object?.name==='Object'&&init.node.callee.property?.name==='keys'
    &&!init.scope.getBinding('Object'));
}
function prove(path,seen=new Set()){
  if(!path?.node)return no('Missing expression');
  if(path.isAwaitExpression())return prove(path.get('argument'),seen);
  if(path.isCallExpression()&&path.get('callee').isMemberExpression()
    &&!path.node.callee.computed&&path.node.callee.property.name==='readFile'){
    const receiver=path.get('callee.object'),binding=receiver.isIdentifier()&&receiver.scope.getBinding(receiver.node.name);
    const args=path.get('arguments'),url=args[0];
    const imported=binding?.path.isImportDefaultSpecifier()
      &&binding.path.parentPath.node.source.value==='node:fs/promises';
    const intact=imported&&binding.referencePaths.every(ref=>ref.parentPath.isMemberExpression()
      &&!ref.parentPath.node.computed&&ref.parentPath.parentPath.isCallExpression()
      &&ref.parentPath.parentPath.get('callee')===ref.parentPath);
    if(intact&&args.length===2&&args[1].isStringLiteral({value:'utf8'})
      &&url.isNewExpression()&&url.get('callee').isIdentifier({name:'URL'})&&!url.scope.getBinding('URL')
      &&url.node.arguments.length===2&&url.get('arguments.0').isStringLiteral()
      &&/^(?:\.\.\/)+migrations\/[\w-]+\.sql$/.test(url.node.arguments[0].value)
      &&url.get('arguments.1').isMemberExpression()
      &&url.node.arguments[1].property.name==='url'
      &&url.node.arguments[1].object.type==='MetaProperty'
      &&url.node.arguments[1].object.meta.name==='import')
      return yes('Fixed repository migration bytes; bound fs/promises import and immutable literal URL');
  }
  if(path.isStringLiteral()||path.isNumericLiteral())return yes('Fixed source literal');
  if(path.isTemplateLiteral()){
    const parts=path.get('expressions').map(p=>prove(p,new Set(seen)));
    return parts.every(p=>p.safe)?yes('Fixed template fragments and proven interpolations'):
      no('Template interpolation: '+parts.find(p=>!p.safe).reason);
  }
  if(path.isConditionalExpression()||path.isLogicalExpression()){
    if(path.isLogicalExpression()){
      const a=prove(path.get('left'),new Set(seen)),b=prove(path.get('right'),new Set(seen));
      return a.safe&&b.safe?yes('Both logical alternatives are fixed fragments'):no('Logical alternative not proven');
    }
    const a=prove(path.get('consequent'),new Set(seen)),b=prove(path.get('alternate'),new Set(seen));
    return a.safe&&b.safe?yes('Both conditional outcomes are proven fixed fragments'):
      no('Conditional outcome not proven');
  }
  if(path.isUpdateExpression()&&['++','--'].includes(path.node.operator)){
    return prove(path.get('argument'),seen);
  }
  if(path.isCallExpression()&&path.get('callee').isMemberExpression()
    &&!path.node.callee.computed&&path.node.callee.property.name==='trim'
    &&path.node.arguments.length===0)return prove(path.get('callee.object'),seen);
  if(path.isCallExpression()&&path.get('callee').isMemberExpression()
    &&!path.node.callee.computed&&path.node.callee.property.name==='push'
    &&nativeLocalArray(path.get('callee.object'))){
    const binding=path.scope.getBinding(path.node.callee.object.name);
    const intact=binding.referencePaths.every(ref=>{
      const member=ref.parentPath,call=member.parentPath;
      // The values argument of an inventoried DB sink is data, not SQL source.
      if(member.isCallExpression()&&member.node.arguments[1]===ref.node){
        const c=member.node.callee;
        return c.type==='Identifier'&&['query','getMany','getOne'].includes(c.name)
          ||c.type==='MemberExpression'&&!c.computed&&c.property.name==='query';
      }
      return member.isMemberExpression()&&!member.node.computed&&member.get('object')===ref
        &&(member.node.property.name==='length'
          ?!call.isAssignmentExpression()&&!call.isUpdateExpression()
          :['push','join'].includes(member.node.property.name)&&call.isCallExpression()&&call.get('callee')===member);
    });
    if(intact)return yes('Unescaped native array.push returns numeric binding position');
  }
  if(path.isCallExpression()&&path.get('callee').isIdentifier({name:'businessDatePredicate'})){
    const binding=path.scope.getBinding('businessDatePredicate');
    if(binding?.path.isImportSpecifier()&&binding.path.node.imported.name==='businessDatePredicate'
      &&/\/services\/businessDates\.js$/.test(binding.path.parentPath.node.source.value)
      &&path.get('arguments').every(arg=>arg.isBooleanLiteral()||arg.isNullLiteral()||prove(arg,new Set(seen)).safe))
      return yes('Reviewed businessDates helper; column, zone and placeholders fixed/numeric; dates remain bindings');
  }
  if(path.isBinaryExpression()&&['+','-','*','%'].includes(path.node.operator)){
    const a=prove(path.get('left'),new Set(seen)),b=prove(path.get('right'),new Set(seen));
    return a.safe&&b.safe?yes('Fixed fragments / proven numeric arithmetic'):no('Binary operand not proven');
  }
  if(path.isMemberExpression()&&!path.node.computed&&path.node.property.name==='length'
    &&path.get('object').isIdentifier()){
    const binding=path.scope.getBinding(path.node.object.name);
    return binding?.constant&&binding.path.isVariableDeclarator()&&binding.path.get('init').isArrayExpression()
      ?yes('Native local array length is numeric, never request text'):no('Array origin/length not proven');
  }
  if(path.isCallExpression()&&path.get('callee').isMemberExpression()
    &&!path.node.callee.computed&&path.node.callee.property.name==='join'
    &&path.get('callee.object').isIdentifier()){
    if(path.node.arguments.length!==1||!path.get('arguments.0').isStringLiteral())return no('Join separator not fixed');
    const binding=path.scope.getBinding(path.node.callee.object.name);
    if(!binding?.constant||!binding.path.isVariableDeclarator()||!binding.path.get('init').isArrayExpression())
      return no('Joined array origin not proven');
    if(seen.has(binding))return no('Recursive array dependence');
    const next=new Set(seen).add(binding);
    for(const e of binding.path.get('init.elements'))if(!prove(e,next).safe)return no('Array initializer not fixed');
    for(const reference of binding.referencePaths){
      const member=reference.parentPath;
      if(!member.isMemberExpression()||member.node.computed||member.get('object')!==reference)
        return no('Array alias/escape not proven');
      const method=member.node.property.name;
      if(method==='length'){
        // A read of native array length is numeric; arbitrary property writes are not.
        if(member.parentPath.isAssignmentExpression()||member.parentPath.isUpdateExpression())
          return no('Array length mutated');
        continue;
      }
      const call=member.parentPath;
      if(!call.isCallExpression()||call.get('callee')!==member||!['push','join'].includes(method))
        return no('Array operation not allowlisted');
      if(method==='push')for(const arg of call.get('arguments'))if(!prove(arg,new Set(next)).safe)
        return no('Pushed fragment not fixed/bound-placeholder-safe');
    }
    return yes('Array has only proven initial/pushed fragments; no alias/escape');
  }
  if(path.isIdentifier()){
    const binding=path.scope.getBinding(path.node.name);
    if(binding?.constant&&binding.path.isVariableDeclarator()){
      const loop=binding.path.parentPath.parentPath;
      if(loop.isForOfStatement()&&loop.node.left===binding.path.parentPath.node){
        let source=loop.get('right');
        if(source.isIdentifier()){
          const array=source.scope.getBinding(source.node.name);
          source=array?.constant&&array.path.isVariableDeclarator()
            &&array.referencePaths.every(ref=>ref===loop.get('right'))?array.path.get('init'):null;
        }
        if(source?.isArrayExpression()&&source.get('elements').length
          &&source.get('elements').every(p=>prove(p,new Set(seen)).safe))
          return yes('Unmutated for-of binding over fixed unescaped source fragments');
      }
    }
    // Built-in array iterator index, never the request-controlled element.
    if(binding?.kind==='param'&&binding.path.isIdentifier()){
      const callback=binding.path.parentPath;
      const call=callback.parentPath;
      if((callback.isArrowFunctionExpression()||callback.isFunctionExpression())
        &&callback.node.params[1]===binding.path.node&&call.isCallExpression()
        &&call.node.arguments[0]===callback.node&&call.get('callee').isMemberExpression()
        &&!call.node.callee.computed&&['map','forEach'].includes(call.node.callee.property.name)
        &&nativeLocalArray(call.get('callee.object'))&&binding.constant)
        return yes('Native local-array iterator numeric index');
    }
    if(!binding?.path.isVariableDeclarator())return no('Identifier has no local declarator proof');
    if(seen.has(binding))return no('Recursive binding dependence');
    const next=new Set(seen).add(binding),initial=prove(binding.path.get('init'),next);
    if(!initial.safe)return no('Initializer: '+initial.reason);
    for(const violation of binding.constantViolations){
      if(violation.isUpdateExpression()&&violation.get('argument').isIdentifier({name:path.node.name})
        &&['++','--'].includes(violation.node.operator)&&binding.path.get('init').isNumericLiteral())continue;
      if(!violation.isAssignmentExpression()||!['+=','='].includes(violation.node.operator)
        ||!violation.get('left').isIdentifier({name:path.node.name})
        ||!prove(violation.get('right'),new Set(next)).safe)return no('Reassignment not proven');
    }
    return yes('Local binding initializer and every reassignment proven');
  }
  return no('Unsupported '+path.node.type+' requires explicit control/data-flow review');
}
export function reviewSqlLocations(source,locations){
  const wanted=new Map(locations.map(x=>[x.line+':'+x.column,x]));
  const results=new Map();
  const ast=parse(source,{sourceType:'unambiguous',plugins:['jsx'],allowReturnOutsideFunction:true});
  traverse(ast,{CallExpression(path){
    const key=path.node.loc.start.line+':'+(path.node.loc.start.column+1);
    if(!wanted.has(key))return;
    const proof=prove(path.get('arguments.0'));
    results.set(key,{...wanted.get(key),classification:proof.safe?
      (wanted.get(key).hasValueArguments===false?'fixed internal constant':'static SQL with bound values'):'unresolved blocker',
      evidence:proof.reason,proofScope:'Syntax/data-shape only; not SQL correctness, authorization or full interprocedural proof'});
  }});
  return locations.map(x=>results.get(x.line+':'+x.column)||{...x,classification:'unresolved blocker',
    evidence:'Original source location did not match a current call; manual review required'});
}
