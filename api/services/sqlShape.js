// SQL structure is built here; runtime values always stay in pg bindings.
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
