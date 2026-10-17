// Fixed catalog-only inspection protocol. No business relation is a SQL source.
export const scope=Object.freeze([
  Object.freeze({schema:'public',table:'branches',column:null,file:'branches.schema.json'}),
  Object.freeze({schema:'public',table:'branch_activity_transactions',column:null,file:'branch-activity-transactions.schema.json'}),
  Object.freeze({schema:'public',table:'branch_distributor_profit',column:null,file:'branch-distributor-profit.schema.json'}),
  Object.freeze({schema:'public',table:'users',column:'additional_roles',file:'users-additional-roles.schema.json'})
]);
const relations=Object.freeze({
  columns:['information_schema.columns'],
  constraints:['pg_catalog.pg_constraint','pg_catalog.pg_class','pg_catalog.pg_namespace','pg_catalog.pg_attribute'],
  indexes:['pg_catalog.pg_index','pg_catalog.pg_class','pg_catalog.pg_namespace','pg_catalog.pg_attribute','pg_catalog.pg_depend'],
  sequences:['pg_catalog.pg_depend','pg_catalog.pg_class','pg_catalog.pg_namespace','pg_catalog.pg_attribute','pg_catalog.pg_sequence'],
  enums:['pg_catalog.pg_attribute','pg_catalog.pg_class','pg_catalog.pg_namespace','pg_catalog.pg_type','pg_catalog.pg_enum'],
  partitions:['pg_catalog.pg_class','pg_catalog.pg_namespace','pg_catalog.pg_partitioned_table','pg_catalog.pg_inherits']
});
export const queries=Object.freeze({
  columns:`SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,
    character_maximum_length,numeric_precision,numeric_scale,datetime_precision,is_nullable,
    column_default,is_identity,identity_generation,identity_start,identity_increment,
    identity_minimum,identity_maximum,identity_cycle,is_generated,generation_expression,
    domain_schema,domain_name,collation_schema,collation_name
    FROM information_schema.columns
    WHERE table_schema=$1 AND table_name=$2 AND ($3::text IS NULL OR column_name=$3)
    ORDER BY ordinal_position`,
  constraints:`SELECT c.conname AS name,c.contype AS type,c.condeferrable,c.condeferred,c.convalidated,
    pg_catalog.pg_get_constraintdef(c.oid,true) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=$1 AND t.relname=$2 AND
      ($3::text IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=t.oid AND a.attname=$3 AND a.attnum=ANY(c.conkey)))
    ORDER BY c.conname`,
  indexes:`SELECT x.relname AS name,i.indisunique,i.indisprimary,i.indisvalid,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition,
    pg_catalog.pg_get_expr(i.indpred,i.indrelid,true) AS predicate
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
    JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=$1 AND t.relname=$2 AND ($3::text IS NULL OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.oid AND a.attname=$3 AND
      (a.attnum=ANY(i.indkey) OR EXISTS(SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=i.indexrelid AND
        d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid=t.oid AND d.refobjsubid=a.attnum))))
    ORDER BY x.relname`,
  sequences:`SELECT ns.nspname AS sequence_schema,s.relname AS sequence_name,a.attname AS column_name,
    d.deptype AS ownership_type,q.seqstart,q.seqincrement,q.seqmax,q.seqmin,q.seqcache,q.seqcycle
    FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_class s ON s.oid=d.objid AND s.relkind='S'
    JOIN pg_catalog.pg_namespace ns ON ns.oid=s.relnamespace
    JOIN pg_catalog.pg_sequence q ON q.seqrelid=s.oid
    JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
    WHERE d.classid='pg_catalog.pg_class'::regclass AND d.refclassid='pg_catalog.pg_class'::regclass
    AND d.deptype IN ('a','i') AND n.nspname=$1 AND t.relname=$2
    AND ($3::text IS NULL OR a.attname=$3) ORDER BY s.relname`,
  enums:`SELECT a.attname AS column_name,nt.nspname AS type_schema,ty.typname AS type_name,
    e.enumsortorder,e.enumlabel
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_catalog.pg_type ty ON ty.oid=a.atttypid
    JOIN pg_catalog.pg_namespace nt ON nt.oid=ty.typnamespace
    JOIN pg_catalog.pg_enum e ON e.enumtypid=ty.oid
    WHERE n.nspname=$1 AND t.relname=$2 AND a.attnum>0 AND NOT a.attisdropped
    AND ($3::text IS NULL OR a.attname=$3) ORDER BY a.attnum,e.enumsortorder`,
  partitions:`SELECT t.relname AS table_name,t.relkind,t.relispartition,
    pg_catalog.pg_get_partkeydef(t.oid) AS partition_key,
    pg_catalog.pg_get_expr(t.relpartbound,t.oid,true) AS partition_bound,
    parent.relname AS parent_table,np.nspname AS parent_schema
    FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    LEFT JOIN pg_catalog.pg_partitioned_table p ON p.partrelid=t.oid
    LEFT JOIN pg_catalog.pg_inherits h ON h.inhrelid=t.oid
    LEFT JOIN pg_catalog.pg_class parent ON parent.oid=h.inhparent
    LEFT JOIN pg_catalog.pg_namespace np ON np.oid=parent.relnamespace
    WHERE n.nspname=$1 AND t.relname=$2 AND $3::text IS NULL`
});
export const controls=Object.freeze({
  begin:'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',commit:'COMMIT',rollback:'ROLLBACK',
  identity:`SELECT pg_catalog.current_database() AS database_name,
    pg_catalog.current_setting('default_transaction_read_only') AS session_read_only,
    pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
    pg_catalog.current_setting('statement_timeout') AS statement_timeout,
    pg_catalog.current_setting('lock_timeout') AS lock_timeout,
    pg_catalog.pg_is_in_recovery() AS in_recovery`
});
export function querySpec(id,object) {
  if(!Object.hasOwn(queries,id))throw Error('Query outside fixed catalog allowlist');
  const permitted=scope.find(s=>s.schema===object?.schema&&s.table===object?.table&&s.column===object?.column);
  if(!permitted||id==='partitions'&&permitted.table==='users')throw Error('Object outside authorized scope');
  return {text:queries[id],values:[permitted.schema,permitted.table,permitted.column],relations:relations[id]};
}
export function assertWindow(authorization,now=Date.now()) {
  const start=Date.parse(authorization.startsAt),end=Date.parse(authorization.expiresAt);
  if(!Number.isFinite(start)||end-start!==7200000||now<start||now>=end)
    throw Error('Authorization window unavailable or expired');
}
function milliseconds(text) {
  const match=String(text).match(/^(\d+)(ms|s)?$/);
  return match?Number(match[1])*(match[2]==='s'?1000:1):NaN;
}
export function assertReadOnlySession(row) {
  const statement=milliseconds(row.statement_timeout),lock=milliseconds(row.lock_timeout);
  if(row.session_read_only!=='on'||row.transaction_read_only!=='on'||
    !(statement>0&&statement<=5000)||!(lock>0&&lock<=1000))
    throw Error('Read-only session or short timeouts not proven');
}
export function sanitizeMetadata(value) {
  let redactions=0;
  const safeLiterals=new Set(['','{}','[]','active','inactive','pending','approved','rejected','cancelled',
    'paid','unpaid','completed','draft','received','dispatched','sale','return','adjustment']);
  function visit(item,key='') {
    if(Array.isArray(item))return item.map(v=>visit(v,key));
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([k,v])=>[k,visit(v,k)]));
    if(typeof item!=='string')return item;
    if(/(?:postgres(?:ql)?|https?):\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(item)){
      redactions++;return '[REDACTED_METADATA]';
    }
    if(['column_default','generation_expression','definition','predicate','partition_key','partition_bound','enumlabel'].includes(key)){
      if(key==='enumlabel'&&!safeLiterals.has(item)){redactions++;return '[REDACTED_LITERAL]';}
      return item.replace(/(\$[A-Za-z_0-9]*\$)[\s\S]*?\1|(?:[eE])?'(?:''|\\[\s\S]|[^'\\])*'/g,literal=>{
        if(literal.startsWith('$')||/^[eE]'/.test(literal)){redactions++;return "'[REDACTED_LITERAL]'";}
        const text=literal.slice(1,-1).replaceAll("''","'");
        if(safeLiterals.has(text)||/^[+-]?\d+(?:\.\d+)?$/.test(text)||
          /^(?:public\.)?[A-Za-z_][A-Za-z0-9_]*_seq$/.test(text))return literal;
        redactions++;return "'[REDACTED_LITERAL]'";
      });
    }
    return item;
  }
  return {metadata:visit(value),redactions};
}
