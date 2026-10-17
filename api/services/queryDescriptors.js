// SQL admission is capability based. Nothing returned by JSON.parse, a spread,
// an inherited property, or a copied descriptor can acquire these brands.
import {AsyncLocalStorage} from 'node:async_hooks';
import {types as nativeTypes} from 'node:util';
import {applicationFields,applicationTable,fieldSnapshot} from './sqlFieldPolicy.js';
import registeredCatalog from './registeredSqlCatalog.js';
import {channel} from 'node:diagnostics_channel';
import {createHash} from 'node:crypto';
const plans=new WeakMap(),descriptors=new WeakMap(),execution=new AsyncLocalStorage();
let catalog=null,startupClosed=false;
const separators=Object.freeze({empty:'',and:' AND ',or:' OR ',comma:', ',compactComma:',',space:' '});
const contextNames=Object.freeze(['service','request','transaction','startup','worker','owned-tool']);
const rejectionChannel=channel('dynapharm.sql-boundary.rejected');
const admissionChannel=channel('dynapharm.sql-boundary.admitted');
const refuse=(boundaryReason='INVALID_DESCRIPTOR',queryId)=>{const safeId=catalog?.has(queryId)?queryId:null;
  rejectionChannel.publish(Object.freeze({reason:boundaryReason,queryId:safeId}));
  throw Object.assign(new Error('Query boundary rejected the operation'),{code:'QUERY_BOUNDARY_REJECTED',boundaryReason});};
function opaqueText(text,properties){
  const value=new String(text);
  for(const [key,item]of Object.entries(properties))Object.defineProperty(value,key,{value:item,enumerable:true});
  return Object.freeze(value);
}
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
      if(!item||item.spec.kind!=='fragment')refuse('SLOT_KIND',id);
      if(item.spec.group!==null&&item.spec.group!==spec.group&&item.spec.group!=='finite-date')refuse('SLOT_FAMILY',id);
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
  const plan=opaqueText(text,{queryId:id});plans.set(plan,{text,spec,id});return plan;
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
    if(entry.spec.group!==null&&entry.spec.group!=='finite-date')groups.add(entry.spec.group);
    if(entry.spec.kind==='statement'){
      if(statementSpec)refuse();
      statementSpec=entry.spec;
    }
    for(const c of contexts)if(!entry.spec.contexts.includes(c))contexts.delete(c);
  }
  if(groups.size>1)refuse();
  const plan=opaqueText(texts.join(separators[separator]),{queryId:'composite'});
  plans.set(plan,{text:texts.join(separators[separator]),id:ids.join('+'),spec:{
    operation:statementSpec?.operation||'read',contexts:[...contexts],
    group:[...groups][0]??null,kind:statementSpec?'statement':'fragment'}});
  return plan;
}
export function bindPlan(plan,values){
  if(descriptors.has(plan)){
    if(values!==undefined&&values!==plan.values&&!equalSnapshot(snapshot(values),descriptors.get(plan).values))refuse();
    return plan;
  }
  const entry=plans.get(plan);if(!entry)refuse('UNREGISTERED_PLAN');
  if(entry.spec.kind!=='statement')refuse('FRAGMENT_NOT_EXECUTABLE',entry.id);
  values??=[];
  if(!Array.isArray(values))refuse();
  const privateValues=snapshot(values),publicValues=snapshot(privateValues);
  const descriptor=opaqueText(entry.text,{text:entry.text,values:publicValues,params:publicValues,
    queryId:entry.id,operation:entry.spec.operation,permittedContexts:Object.freeze([...entry.spec.contexts])});
  descriptors.set(descriptor,{...entry,values:privateValues,publicValues});return descriptor;
}
export function executionArguments(descriptor,legacyValues){
  const entry=descriptors.get(descriptor);if(!entry)refuse();
  if(legacyValues!==undefined&&legacyValues!==descriptor.values)refuse();
  if(!equalSnapshot(snapshot(descriptor.values),entry.values))refuse();
  const context=execution.getStore()||'service';
  if(!entry.spec.contexts.includes(context))refuse();
  // No values, SQL text, credentials or records leave this private diagnostic
  // channel. With no owned-test subscriber there is no hash/logging work.
  if(admissionChannel.hasSubscribers)admissionChannel.publish(Object.freeze({
    queryId:entry.id,operation:entry.spec.operation,
    sqlFingerprint:createHash('sha256').update(entry.text).digest('hex')}));
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
export function executePlan(executor,plan,values){
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
    assertTransactionStatement(admitted);
    return driver(admitted.text,admitted.values);
  }});
}
export function assertTransactionStatement(admitted){
  // Fixed admitted SAVEPOINT / ROLLBACK TO statements preserve nested atomic
  // work. A callback may never end the wrapper's outer transaction.
  if(/^\s*(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|END\b|ABORT\b|PREPARE\s+TRANSACTION\b|ROLLBACK\b(?!\s+TO\b))/i.test(admitted.text))
    refuse('TRANSACTION_CONTROL');
}
export function transactionIsolationDescriptor(mode){
  const levels=Object.freeze({'repeatable-read':'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
    'serializable':'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    'read-only':'SET TRANSACTION READ ONLY',
    'repeatable-read-read-only':'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    'report-timeout-15s':"SET LOCAL statement_timeout='15s'"});
  if(typeof mode!=='string'||!Object.hasOwn(levels,mode))refuse();
  const text=levels[mode],plan=opaqueText(text,{queryId:'finite/isolation/'+mode});
  plans.set(plan,{text,id:plan.queryId,spec:{kind:'statement',group:'isolation',operation:'control',contexts:['transaction']}});
  return bindPlan(plan,[]);
}
// A finite builder, not a raw-text admission shim. Callers provide only an
// operation enum, allowlisted table/fields and separately bound record values.
export function crudDescriptor(mode,table,data={},id,idColumn='id',order='created_at DESC'){
  applicationTable(table);
  if(!['insert','update','remove','findById','findAll'].includes(mode))refuse();
  const allowed=applicationFields[table];
  if(typeof idColumn!=='string'||!allowed.includes(idColumn))refuse();
  const record=fieldSnapshot(data,allowed),columns=Object.keys(record);
  const quote=c=>`"${c}"`;let text,values=columns.map(c=>record[c]);
  if(mode==='insert'){
    if(!columns.length)refuse();
    text=`INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(', ')}) RETURNING *`;
  }else if(mode==='update'){
    const fields=columns.filter(c=>c!==idColumn);if(!fields.length)refuse();
    values=[...fields.map(c=>record[c]),id];
    text=`UPDATE ${table} SET ${fields.map((c,i)=>`${quote(c)} = $${i+1}`).join(', ')} WHERE ${quote(idColumn)} = $${values.length} RETURNING *`;
  }else if(mode==='findAll'){
    if(typeof order!=='string'||order.length>500)refuse();
    const terms=order.split(',').map(term=>{
      const match=term.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i);
      if(!match||!allowed.includes(match[1]))refuse();
      return `${quote(match[1])} ${(match[2]||'ASC').toUpperCase()}`;
    });
    text=`SELECT * FROM ${table}`+(columns.length?' WHERE '+columns.map((c,i)=>`${quote(c)} = $${i+1}`).join(' AND '):'')+' ORDER BY '+terms.join(', ');
  }else{
    values=[id];text=(mode==='remove'?'DELETE FROM ':'SELECT * FROM ')+table+` WHERE ${quote(idColumn)} = $1`+(mode==='remove'?' RETURNING *':'');
  }
  const queryId=`crud/${table}/${mode}`,plan=Object.freeze({queryId});
  plans.set(plan,{text,id:queryId,spec:{kind:'statement',group:'crud',operation:['findAll','findById'].includes(mode)?'read':'write',
    contexts:['service','request','transaction','startup','worker']}});
  return bindPlan(plan,values);
}
export function datePredicatePlan(column,placeholder,end=false,legacyZone=null,instant=false){
  if(!['created_at','sale_date','s.sale_date'].includes(column)||typeof end!=='boolean'||
    typeof instant!=='boolean'||![null,'UTC','Africa/Windhoek'].includes(legacyZone))refuse();
  const token=typeof placeholder==='string'?placeholder:plans.get(placeholder)?.text;
  if(typeof token!=='string'||!/^\$[1-9]\d{0,4}$/.test(token)||Number(token.slice(1))>65535)refuse();
  const expression=legacyZone?`(${column} AT TIME ZONE '${legacyZone}')`:column;
  const text=instant?`${column} ${end?'<':'>='} ${token}::timestamptz`:
    `${expression} ${end?'<':'>='} ((${token}::date${end?'+1':''})::timestamp AT TIME ZONE 'Africa/Windhoek')`;
  const plan=opaqueText(text,{queryId:'finite/date'});
  plans.set(plan,{text,id:'finite/date',spec:{kind:'fragment',group:'finite-date',operation:'read',
    contexts:['service','request','transaction','startup','worker']}});
  return plan;
}
export function columnPlans(id,columns){
  const copy=snapshot(columns);if(!Array.isArray(copy))refuse();
  return Object.freeze(copy.map(column=>registeredPlan(id,[column])));
}
export function trimPlan(plan){
  const entry=plans.get(plan);if(!entry)refuse();
  const text=entry.text.trim(),result=opaqueText(text,{queryId:entry.id});
  plans.set(result,{...entry,text});return result;
}
export function physicalPrefix(plan){
  const entry=plans.get(plan);
  if(!entry||entry.spec.group!=='api/services/controlledStockRegister.js')refuse();
  const marker=', filtered AS',index=entry.text.indexOf(marker);
  if(index<0)refuse();
  const text=entry.text.slice(0,index),result=opaqueText(text,{queryId:entry.id+'/physical'});
  plans.set(result,{...entry,text,spec:{...entry.spec,kind:'fragment'}});return result;
}
export function reconciliationSubquery(plan){
  const entry=plans.get(plan)||descriptors.get(plan);
  const allowed=['api/services/stockCostReporting.js:13:0',
    'api/services/stockReadOnlyReconciliation.js:base'];
  if(!entry||!allowed.includes(entry.id)||entry.spec.operation!=='read')refuse();
  if(descriptors.has(plan)&&!equalSnapshot(entry.values,[null,null]))refuse();
  const fragment=opaqueText(entry.text,{queryId:'derived/reconciliation/'+entry.id});
  plans.set(fragment,{text:entry.text,id:fragment.queryId,spec:{kind:'fragment',
    group:'api/services/stockReadOnlyReconciliation.js',operation:'read',contexts:entry.spec.contexts}});
  return fragment;
}
export function replaceSearchPlaceholder(plan,placeholder){
  const entry=plans.get(plan);
  if(!entry||entry.spec.group!=='api/stock-movements.js'||typeof placeholder!=='string'||
    !/^\$[1-9]\d{0,4}$/.test(placeholder)||Number(placeholder.slice(1))>65535)refuse();
  const text=entry.text.replaceAll('$SEARCH',placeholder),result=opaqueText(text,{queryId:entry.id+'/search'});
  plans.set(result,{...entry,text});return result;
}
export function branchSearchPredicate(plan){
  const entry=plans.get(plan);if(!entry||entry.spec.group!=='api/stock-movements.js')refuse();
  const text=entry.text.replaceAll('reference_id','reference').replaceAll('source_location','branch_id')
    .replaceAll('destination_location','destination_branch_id');
  const result=opaqueText(text,{queryId:entry.id+'/branch'});
  plans.set(result,{...entry,text});return result;
}
export function priceReferenceCount(schema,table,column,ids){
  if([schema,table,column].some(v=>typeof v!=='string')||schema!=='public')refuse();
  const fixed=Object.freeze({
    'product_price_history.product_id':'SELECT COUNT(*)::int AS count FROM public.product_price_history WHERE product_id=ANY($1::int[])',
    'product_prices.merged_into_id':'SELECT COUNT(*)::int AS count FROM public.product_prices WHERE merged_into_id=ANY($1::int[])',
    'price_import_additions.product_id':'SELECT COUNT(*)::int AS count FROM public.price_import_additions WHERE product_id=ANY($1::int[])',
  });
  const key=table+'.'+column;if(!Object.hasOwn(fixed,key))refuse();
  const plan=opaqueText(fixed[key],{queryId:'finite/price-reference/'+key});
  plans.set(plan,{text:fixed[key],id:plan.queryId,spec:{kind:'statement',group:'price-reference',
    operation:'read',contexts:['service','request','transaction','startup']}});
  return bindPlan(plan,[ids]);
}
// Application imports always see a sealed repository catalog. There is no
// request-time catalog installation window.
installQueryCatalog(registeredCatalog);
