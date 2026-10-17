// Conservative syntax proofs, not an interprocedural/permission audit.
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const yes=reason=>({safe:true,reason}),no=reason=>({safe:false,reason});
function prove(path,seen=new Set()){
  if(!path?.node)return no('Missing expression');
  if(path.isStringLiteral()||path.isNumericLiteral())return yes('Fixed source literal');
  if(path.isTemplateLiteral()){
    const parts=path.get('expressions').map(p=>prove(p,new Set(seen)));
    return parts.every(p=>p.safe)?yes('Fixed template fragments and proven interpolations'):
      no('Template interpolation: '+parts.find(p=>!p.safe).reason);
  }
  if(path.isConditionalExpression()){
    const a=prove(path.get('consequent'),new Set(seen)),b=prove(path.get('alternate'),new Set(seen));
    return a.safe&&b.safe?yes('Both conditional outcomes are proven fixed fragments'):
      no('Conditional outcome not proven');
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
    if(!binding?.path.isVariableDeclarator())return no('Identifier has no local declarator proof');
    if(seen.has(binding))return no('Recursive binding dependence');
    const next=new Set(seen).add(binding),initial=prove(binding.path.get('init'),next);
    if(!initial.safe)return no('Initializer: '+initial.reason);
    for(const violation of binding.constantViolations){
      if(!violation.isAssignmentExpression()||violation.node.operator!=='+='
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
