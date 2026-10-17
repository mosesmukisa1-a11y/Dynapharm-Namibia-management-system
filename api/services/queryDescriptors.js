// SQL admission is capability based. Nothing returned by JSON.parse, a spread,
// an inherited property, or a copied descriptor can acquire these brands.
import {AsyncLocalStorage} from 'node:async_hooks';
import {types as nativeTypes} from 'node:util';
const plans=new WeakMap(),descriptors=new WeakMap(),execution=new AsyncLocalStorage();
let catalog=null,startupClosed=false;
const separators=Object.freeze({empty:'',and:' AND ',or:' OR ',comma:', ',compactComma:',',space:' '});
const contextNames=Object.freeze(['service','request','transaction','startup','worker','owned-tool']);
const refuse=()=>{throw Object.assign(new Error('Query boundary rejected the operation'),{code:'QUERY_BOUNDARY_REJECTED'});};
function ownRecord(value){
  if(!value||nativeTypes.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)refuse();
  const fields=Object.getOwnPropertyDescriptors(value);
  for(const field of Object.values(fields))if(!Object.hasOwn(field,'value'))refuse();
  return fields;
}
function snapshot(value,seen=new Set()){
  if(value===null||value===undefined||['string','boolean','bigint'].includes(typeof value))return value;
  if(typeof value==='number'){if(!Number.isFinite(value))refuse();return value;}
  if(typeof value!=='object'||nativeTypes.isProxy(value)||seen.has(value))refuse();
  seen.add(value);
  try{
    if(value instanceof Date){
      if(Object.getPrototypeOf(value)!==Date.prototype||Reflect.ownKeys(value).length)refuse();
      const time=Date.prototype.getTime.call(value);if(!Number.isFinite(time))refuse();return new Date(time);
    }
    if(Buffer.isBuffer(value)){
      if(Object.getPrototypeOf(value)!==Buffer.prototype||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!/^(0|[1-9]\d*)$/.test(k)))refuse();
      const copy=Buffer.alloc(value.length);Uint8Array.prototype.set.call(copy,value);return copy;
    }
    if(Array.isArray(value)){
      if(Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length)refuse();
      const fields=Object.getOwnPropertyDescriptors(value);
      if(Object.keys(fields).some(k=>k!=='length'&&!/^(0|[1-9]\d*)$/.test(k)))refuse();
      const copy=[];
      for(let i=0;i<value.length;i++){
        const f=fields[i];if(f&&!Object.hasOwn(f,'value'))refuse();
        copy.push(snapshot(f?.value,seen));
      }
      return Object.freeze(copy);
    }
    const copy=Object.create(null);
    for(const [key,field]of Object.entries(ownRecord(value))){
      if(['__proto__','constructor','prototype'].includes(key))refuse();
      copy[key]=snapshot(field.value,seen);
    }
    return Object.freeze(copy);
  }finally{seen.delete(value);}
}
function equalSnapshot(a,b){
  if(a instanceof Date&&b instanceof Date)return a.getTime()===b.getTime();
  if(Buffer.isBuffer(a)&&Buffer.isBuffer(b))return a.equals(b);
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return Object.is(a,b);
  const ak=Object.keys(a),bk=Object.keys(b);
  return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&equalSnapshot(a[k],b[k]));
}
// Called once by the trusted source compiler before loading application code.
// There is no append/register/unseal operation once application loading starts.
export function installQueryCatalog(definitions){
  if(catalog!==null)refuse();
  const input=snapshot(definitions),next=new Map();
  for(const [id,spec]of Object.entries(input)){
    if(!/^[A-Za-z0-9_./:#-]+$/.test(id)||!Array.isArray(spec.chunks)||!Array.isArray(spec.slots)||
      spec.chunks.length!==spec.slots.length+1||spec.chunks.some(s=>typeof s!=='string')||
      !['read','write','schema','control'].includes(spec.operation)||!Array.isArray(spec.contexts)||
      spec.contexts.some(c=>!contextNames.includes(c))||typeof spec.group!=='string'||
      !['statement','fragment'].includes(spec.kind))refuse();
    for(const slot of spec.slots){
      if(!['part','integer','choice'].includes(slot.kind))refuse();
      if(slot.kind==='choice'&&(!Array.isArray(slot.choices)||!slot.choices.length||
        slot.choices.some(c=>typeof c!=='string')))refuse();
      if(slot.kind==='integer'&&(!Number.isSafeInteger(slot.min)||!Number.isSafeInteger(slot.max)||
        slot.min>slot.max))refuse();
    }
    if(spec.operation==='schema'&&spec.contexts.some(c=>!['startup','owned-tool'].includes(c)))refuse();
    next.set(id,spec);
  }
  catalog=next;
}
export function registeredPlan(id,slots=[]){
  const spec=catalog?.get(id);if(!spec||nativeTypes.isProxy(slots)||!Array.isArray(slots)||
    Object.getPrototypeOf(slots)!==Array.prototype||Object.getOwnPropertySymbols(slots).length||slots.length!==spec.slots.length)refuse();
  // Never execute a caller's map/join/getter or convert a structural object to a string.
  const fields=Object.getOwnPropertyDescriptors(slots);
  if(Object.keys(fields).some(k=>k!=='length'&&!/^(0|[1-9]\d*)$/.test(k)))refuse();
  let text=spec.chunks[0];
  for(let i=0;i<slots.length;i++){
    if(!fields[i]||!Object.hasOwn(fields[i],'value'))refuse();
    const value=fields[i].value,rule=spec.slots[i];let part;
    if(rule.kind==='part'){
      const item=plans.get(value);
      if(!item||item.spec.kind!=='fragment'||
        (item.spec.group!==null&&item.spec.group!==spec.group))refuse();
      part=item.text;
    }
    if(rule.kind==='integer'){
      if(typeof value!=='number'||!Number.isSafeInteger(value)||value<rule.min||value>rule.max)refuse();
      part=String(value);
    }
    if(rule.kind==='choice'){
      if(typeof value!=='string'||!rule.choices.includes(value))refuse();
      part=value;
    }
    text+=part+spec.chunks[i+1];
  }
  const plan=Object.freeze({queryId:id});plans.set(plan,{text,spec,id});return plan;
}
export function joinPlans(items,separator='empty'){
  if(!Object.hasOwn(separators,separator)||nativeTypes.isProxy(items)||!Array.isArray(items)||Object.getPrototypeOf(items)!==Array.prototype)refuse();
  const fields=Object.getOwnPropertyDescriptors(items);
  if(Object.getOwnPropertySymbols(items).length||Object.keys(fields).some(k=>k!=='length'&&!/^(0|[1-9]\d*)$/.test(k)))refuse();
  const texts=[],ids=[],contexts=new Set(contextNames),groups=new Set();let statementSpec;
  for(let i=0;i<items.length;i++){
    if(!fields[i]||!Object.hasOwn(fields[i],'value'))refuse();
    const entry=plans.get(fields[i].value);if(!entry)refuse();
    texts.push(entry.text);ids.push(entry.id);
    if(entry.spec.group!==null)groups.add(entry.spec.group);
    if(entry.spec.kind==='statement'){
      if(statementSpec)refuse();
      statementSpec=entry.spec;
    }
    for(const c of contexts)if(!entry.spec.contexts.includes(c))contexts.delete(c);
  }
  if(groups.size>1)refuse();
  const plan=Object.freeze({queryId:'composite'});
  plans.set(plan,{text:texts.join(separators[separator]),id:ids.join('+'),spec:{
    operation:statementSpec?.operation||'read',contexts:[...contexts],
    group:[...groups][0]??null,kind:statementSpec?'statement':'fragment'}});
  return plan;
}
export function bindPlan(plan,values=[]){
  if(descriptors.has(plan)){
    if(values!==undefined&&values!==plan.values&&!equalSnapshot(snapshot(values),descriptors.get(plan).values))refuse();
    return plan;
  }
  const entry=plans.get(plan);if(!entry||entry.spec.kind!=='statement')refuse();
  if(!Array.isArray(values))refuse();
  const privateValues=snapshot(values),publicValues=snapshot(privateValues);
  const descriptor=Object.freeze({text:entry.text,values:publicValues,params:publicValues,
    queryId:entry.id,operation:entry.spec.operation,permittedContexts:Object.freeze([...entry.spec.contexts])});
  descriptors.set(descriptor,{...entry,values:privateValues,publicValues});return descriptor;
}
export function executionArguments(descriptor,legacyValues){
  const entry=descriptors.get(descriptor);if(!entry)refuse();
  if(legacyValues!==undefined&&legacyValues!==descriptor.values)refuse();
  if(!equalSnapshot(snapshot(descriptor.values),entry.values))refuse();
  const context=execution.getStore()||'service';
  if(!entry.spec.contexts.includes(context))refuse();
  return {text:entry.text,values:snapshot(entry.values),queryId:entry.id,operation:entry.spec.operation};
}
export function withQueryContext(context,fn){
  if(!contextNames.includes(context)||typeof fn!=='function')refuse();
  // An isolated-tool capability is deliberately NOT activated by an env flag
  // or this public context helper. Its owned-connection integration is separate.
  if(context==='owned-tool')refuse();
  const parent=execution.getStore();
  if(context==='startup'&&(startupClosed||['request','transaction','worker'].includes(parent)))refuse();
  if(context==='request')startupClosed=true;
  return execution.run(context,fn);
}
export function sealStartupContext(){startupClosed=true;}
export function executePlan(executor,plan,values=[]){
  if(typeof executor!=='function')refuse();
  const descriptor=bindPlan(plan,values);
  return executor(descriptor,descriptor.values);
}
// The callback receives only this frozen facade. The driver, connection,
// release method and transaction controls stay in its owner's closure.
export function restrictedDescriptorExecutor(driver){
  if(typeof driver!=='function')refuse();
  return Object.freeze({query(descriptor,values){
    const admitted=executionArguments(descriptor,values);
    return driver(admitted.text,admitted.values);
  }});
}
