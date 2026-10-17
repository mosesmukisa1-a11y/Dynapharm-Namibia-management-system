// SQL structure is built here; runtime values always stay in pg bindings.
import {fieldSnapshot} from './sqlFieldPolicy.js';
export function identifier(name) {
  if(typeof name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new Error('Invalid SQL identifier');
  return name;
}
export function orderByClause(value='created_at DESC') {
  if(typeof value!=='string'||value.length>500)throw new Error('Invalid SQL ordering');
  return value.split(',').map(part=>{
    const match=part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i);
    if(!match)throw new Error('Invalid SQL ordering');
    return `"${identifier(match[1])}" ${String(match[2]||'ASC').toUpperCase()}`;
  }).join(', ');
}
export function insertStatement(table,data) {
  const columns=Object.keys(data).map(identifier);
  if(!columns.length)throw new Error('No insert fields');
  return {text:`INSERT INTO ${identifier(table)} (${columns.map(c=>`"${c}"`).join(', ')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(', ')}) RETURNING *`,
    params:Object.values(data)};
}
export function findAllStatement(table,conditions={},order='created_at DESC') {
  const columns=Object.keys(conditions).map(identifier);
  return {text:`SELECT * FROM ${identifier(table)}`+
    (columns.length?' WHERE '+columns.map((c,i)=>`"${c}" = $${i+1}`).join(' AND '):'')+
    ' ORDER BY '+orderByClause(order),params:Object.values(conditions)};
}
// Values can be arbitrary data, but an identifier choice must be in a finite
// source map. Prototype properties are never valid choices.
export function finiteIdentifier(value,choices){
  if(typeof value!=='string'||!Object.hasOwn(choices,value)||typeof choices[value]!=='string')
    throw Error('Invalid SQL identifier');
  return identifier(choices[value]);
}
export function numericPage(value,{fallback=200,max=1000,offset=false}={}){
  if(value==null||value==='')return fallback;
  if(!['number','string'].includes(typeof value)||
    (typeof value==='string'&&!/^\d+$/.test(value.trim())))throw Error('Invalid pagination');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<(offset?0:1))throw Error('Invalid pagination');
  return Math.min(n,max);
}
export function updateStatement(table,id,data,fields,idColumn='id'){
  data=fieldSnapshot(data,fields);
  const columns=Object.keys(data).filter(k=>k!==idColumn);
  if(!columns.length||columns.some(k=>!fields.includes(k)))throw Error('Invalid update fields');
  const descriptors=Object.getOwnPropertyDescriptors(data);
  if(columns.some(k=>!Object.hasOwn(descriptors[k],'value')))throw Error('Invalid update fields');
  return Object.freeze({text:`UPDATE ${identifier(table)} SET ${columns.map((k,i)=>`"${identifier(k)}" = $${i+1}`).join(', ')} WHERE "${identifier(idColumn)}" = $${columns.length+1} RETURNING *`,
    params:Object.freeze([...columns.map(k=>descriptors[k].value),id])});
}
