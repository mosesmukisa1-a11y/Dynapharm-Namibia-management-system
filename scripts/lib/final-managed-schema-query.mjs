// One immutable SELECT. Only nonce and the four exact scope names are bound.
// No application relation is ever a SQL source.
const literals=["","{}","[]","active","inactive","pending","approved","rejected","cancelled",
  "paid","unpaid","completed","draft","received","dispatched","sale","return","adjustment",
  "cash","customer","distributor","branch","warehouse","consultation","walkin","walk_in",
  "retail","normal","credit","debit","stock","available","held","open","closed","confirmed",
  "processing","shipped","delivered","failed","refunded","pickup","delivery","NAD","N$"];
// This private builder accepts only fixed alias expressions below, never input.
const safe=expression=>`CASE WHEN ${expression} IS NULL THEN NULL
  WHEN ${expression} ~* '(postgres(ql)?|https?)://|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    OR EXISTS(SELECT 1 FROM pg_catalog.regexp_matches(${expression},
      $rx$'((?:''|[^'])*)'$rx$,'g') AS literal(parts)
      WHERE literal.parts[1] NOT IN (${literals.map(x=>"'"+x.replaceAll("'","''")+"'").join(',')})
      AND literal.parts[1] !~ '^[+-]?[0-9]+([.][0-9]+)?$'
      AND literal.parts[1] !~ '^(public[.])?[A-Za-z_][A-Za-z0-9_]*_seq$')
  THEN NULL ELSE ${expression} END`;
const columnDefault=safe('c.raw_default'),generated=safe('c.raw_generated');
const constraintDefinition=safe('c.raw_definition'),indexDefinition=safe('i.raw_definition');
const predicate=safe('i.raw_predicate'),partKey=safe('p.raw_key'),partBound=safe('p.raw_bound');
export const finalManagedQueryId='final-authorized-schema-snapshot-v1';
export const finalManagedSql=`WITH
guard AS MATERIALIZED (
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   pg_catalog.current_database() || $1::text,'UTF8')),'hex') AS database_identity_fingerprint,
   pg_catalog.current_setting('default_transaction_read_only') AS session_read_only,
   pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
   pg_catalog.current_setting('statement_timeout') AS statement_timeout,
   pg_catalog.current_setting('lock_timeout') AS lock_timeout,
   pg_catalog.statement_timestamp() AS server_timestamp,
   pg_catalog.pg_is_in_recovery() AS in_recovery,
   (pg_catalog.current_setting('transaction_read_only')='on'
     AND pg_catalog.pg_is_in_recovery()=true) AS allowed
),
approved AS MATERIALIZED (
 SELECT $2::text AS schema_name,$3::text AS table_name,NULL::text AS column_scope FROM guard g WHERE g.allowed
 UNION ALL SELECT $2::text,$4::text,NULL::text FROM guard g WHERE g.allowed
 UNION ALL SELECT $2::text,$5::text,NULL::text FROM guard g WHERE g.allowed
 UNION ALL SELECT $2::text,$6::text,$7::text FROM guard g WHERE g.allowed
),
columns_raw AS MATERIALIZED (
 SELECT s.schema_name,s.table_name,s.column_scope,a.attnum AS ordinal_position,
   a.attname AS column_name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS native_type,
   c.data_type,c.udt_schema,c.udt_name,c.character_maximum_length,c.numeric_precision,c.numeric_scale,
   c.datetime_precision,c.is_nullable,c.is_identity,c.identity_generation,c.identity_start,
   c.identity_increment,c.identity_minimum,c.identity_maximum,c.identity_cycle,
   c.is_generated,c.domain_schema,c.domain_name,c.collation_schema,c.collation_name,
   c.column_default AS raw_default,c.generation_expression AS raw_generated
 FROM approved s CROSS JOIN guard g
 JOIN information_schema.columns c ON true
 JOIN pg_catalog.pg_namespace n ON n.nspname=c.table_schema
 JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid AND t.relname=c.table_name
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attname=c.column_name
 WHERE g.allowed AND c.table_schema=s.schema_name AND c.table_name=s.table_name
   AND (s.column_scope IS NULL OR c.column_name=s.column_scope)
),
columns_safe AS MATERIALIZED (
 SELECT c.schema_name,c.table_name,c.ordinal_position,
   pg_catalog.jsonb_build_object('column_name',c.column_name,'ordinal_position',c.ordinal_position,
     'native_type',c.native_type,'data_type',c.data_type,'udt_schema',c.udt_schema,'udt_name',c.udt_name,
     'character_maximum_length',c.character_maximum_length,'numeric_precision',c.numeric_precision,
     'numeric_scale',c.numeric_scale,'datetime_precision',c.datetime_precision,'is_nullable',c.is_nullable,
     'column_default',${columnDefault},
     'default_redacted',c.raw_default IS NOT NULL AND (${columnDefault}) IS NULL,
     'is_identity',c.is_identity,'identity_generation',c.identity_generation,'identity_start',c.identity_start,
     'identity_increment',c.identity_increment,'identity_minimum',c.identity_minimum,
     'identity_maximum',c.identity_maximum,'identity_cycle',c.identity_cycle,
     'is_generated',c.is_generated,'generation_expression',${generated},
     'generation_redacted',c.raw_generated IS NOT NULL AND (${generated}) IS NULL,
     'domain_schema',c.domain_schema,'domain_name',c.domain_name,
     'collation_schema',c.collation_schema,'collation_name',c.collation_name) AS metadata
 FROM columns_raw c CROSS JOIN guard g WHERE g.allowed
),
constraints_raw AS MATERIALIZED (
 SELECT s.schema_name,s.table_name,c.conname AS name,c.contype AS type,
   c.condeferrable,c.condeferred,c.convalidated,
   pg_catalog.pg_get_constraintdef(c.oid,true) AS raw_definition,
   ARRAY(SELECT a.attname FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY AS k(attnum,position)
     JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.position) AS columns,
   rn.nspname AS referenced_schema,rt.relname AS referenced_table,
   ARRAY(SELECT a.attname FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY AS k(attnum,position)
     JOIN pg_catalog.pg_attribute a ON a.attrelid=rt.oid AND a.attnum=k.attnum ORDER BY k.position) AS referenced_columns
 FROM approved s CROSS JOIN guard g
 JOIN pg_catalog.pg_namespace n ON true JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid
 JOIN pg_catalog.pg_constraint c ON c.conrelid=t.oid
 LEFT JOIN pg_catalog.pg_class rt ON rt.oid=c.confrelid
 LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rt.relnamespace
 WHERE g.allowed AND n.nspname=s.schema_name AND t.relname=s.table_name AND c.contype IN ('p','u','f','c')
   AND (s.column_scope IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=t.oid AND a.attname=s.column_scope AND a.attnum=ANY(c.conkey)))
),
constraints_safe AS MATERIALIZED (
 SELECT c.schema_name,c.table_name,c.name,pg_catalog.jsonb_build_object(
   'name',c.name,'type',c.type,'condeferrable',c.condeferrable,'condeferred',c.condeferred,
   'convalidated',c.convalidated,'columns',c.columns,'referenced_schema',c.referenced_schema,
   'referenced_table',c.referenced_table,'referenced_columns',c.referenced_columns,
   'definition',${constraintDefinition},
   'definition_redacted',c.raw_definition IS NOT NULL AND (${constraintDefinition}) IS NULL) AS metadata
 FROM constraints_raw c CROSS JOIN guard g WHERE g.allowed
),
indexes_raw AS MATERIALIZED (
 SELECT s.schema_name,s.table_name,x.relname AS name,i.indisunique,i.indisprimary,i.indisvalid,
   pg_catalog.pg_get_indexdef(i.indexrelid) AS raw_definition,
   pg_catalog.pg_get_expr(i.indpred,i.indrelid,true) AS raw_predicate,
   ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid,k.position::integer,true)
     FROM pg_catalog.generate_series(1,i.indnatts) AS k(position)) AS indexed_columns
 FROM approved s CROSS JOIN guard g
 JOIN pg_catalog.pg_namespace n ON true JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid
 JOIN pg_catalog.pg_index i ON i.indrelid=t.oid JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
 WHERE g.allowed AND n.nspname=s.schema_name AND t.relname=s.table_name
   AND (s.column_scope IS NULL OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=t.oid AND a.attname=s.column_scope AND (a.attnum=ANY(i.indkey) OR EXISTS(
       SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_class'::regclass
       AND d.objid=i.indexrelid AND d.refclassid='pg_catalog.pg_class'::regclass
       AND d.refobjid=t.oid AND d.refobjsubid=a.attnum))))
),
indexes_safe AS MATERIALIZED (
 SELECT i.schema_name,i.table_name,i.name,pg_catalog.jsonb_build_object(
   'name',i.name,'indisunique',i.indisunique,'indisprimary',i.indisprimary,'indisvalid',i.indisvalid,
   'definition',${indexDefinition},
   'definition_redacted',i.raw_definition IS NOT NULL AND (${indexDefinition}) IS NULL,
   'predicate',${predicate},
   'predicate_redacted',i.raw_predicate IS NOT NULL AND (${predicate}) IS NULL,
   'indexed_columns',CASE WHEN (${indexDefinition}) IS NULL THEN NULL ELSE pg_catalog.to_jsonb(i.indexed_columns) END) AS metadata
 FROM indexes_raw i CROSS JOIN guard g WHERE g.allowed
),
sequences AS MATERIALIZED (
 SELECT s.schema_name,s.table_name,x.relname AS name,
   pg_catalog.jsonb_build_object('sequence_schema',nx.nspname,'sequence_name',x.relname,
     'column_name',a.attname,'ownership_type',d.deptype,'sequence_type',pg_catalog.format_type(q.seqtypid,0),
     'start',q.seqstart,'increment',q.seqincrement,'minimum',q.seqmin,'maximum',q.seqmax,
     'cache',q.seqcache,'cycle',q.seqcycle) AS metadata
 FROM approved s CROSS JOIN guard g
 JOIN pg_catalog.pg_namespace n ON true JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid
 JOIN pg_catalog.pg_depend d ON d.refobjid=t.oid
 JOIN pg_catalog.pg_class x ON x.oid=d.objid AND x.relkind='S'
 JOIN pg_catalog.pg_namespace nx ON nx.oid=x.relnamespace
 JOIN pg_catalog.pg_sequence q ON q.seqrelid=x.oid
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
 WHERE g.allowed AND n.nspname=s.schema_name AND t.relname=s.table_name
   AND d.classid='pg_catalog.pg_class'::regclass AND d.refclassid='pg_catalog.pg_class'::regclass
   AND d.deptype IN ('a','i') AND (s.column_scope IS NULL OR a.attname=s.column_scope)
),
partitions_raw AS MATERIALIZED (
 SELECT s.schema_name,s.table_name,t.relkind,t.relispartition,
   pg_catalog.pg_get_partkeydef(t.oid) AS raw_key,
   pg_catalog.pg_get_expr(t.relpartbound,t.oid,true) AS raw_bound,
   pn.nspname AS parent_schema,parent.relname AS parent_table
 FROM approved s CROSS JOIN guard g JOIN pg_catalog.pg_namespace n ON true
 JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid
 LEFT JOIN pg_catalog.pg_inherits h ON h.inhrelid=t.oid
 LEFT JOIN pg_catalog.pg_class parent ON parent.oid=h.inhparent
 LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=parent.relnamespace
 WHERE g.allowed AND s.column_scope IS NULL AND n.nspname=s.schema_name AND t.relname=s.table_name
),
partitions_safe AS MATERIALIZED (
 SELECT p.schema_name,p.table_name,pg_catalog.jsonb_build_object(
   'relkind',p.relkind,'relispartition',p.relispartition,'partition_key',${partKey},
   'key_redacted',p.raw_key IS NOT NULL AND (${partKey}) IS NULL,
   'partition_bound',${partBound},'bound_redacted',p.raw_bound IS NOT NULL AND (${partBound}) IS NULL,
   'parent_schema',p.parent_schema,'parent_table',p.parent_table) AS metadata
 FROM partitions_raw p CROSS JOIN guard g WHERE g.allowed
)
SELECT pg_catalog.jsonb_build_object('identity',(SELECT pg_catalog.to_jsonb(g) FROM guard g),
 'guardPassed',(SELECT g.allowed FROM guard g),
 'objects',CASE WHEN (SELECT g.allowed FROM guard g) THEN
  COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'schema',s.schema_name,'table',s.table_name,'columnScope',s.column_scope,
   'columns',COALESCE((SELECT pg_catalog.jsonb_agg(c.metadata ORDER BY c.ordinal_position)
     FROM columns_safe c CROSS JOIN guard g WHERE g.allowed AND c.schema_name=s.schema_name AND c.table_name=s.table_name),'[]'::jsonb),
   'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(c.metadata ORDER BY c.name)
     FROM constraints_safe c CROSS JOIN guard g WHERE g.allowed AND c.schema_name=s.schema_name AND c.table_name=s.table_name),'[]'::jsonb),
   'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(i.metadata ORDER BY i.name)
     FROM indexes_safe i CROSS JOIN guard g WHERE g.allowed AND i.schema_name=s.schema_name AND i.table_name=s.table_name),'[]'::jsonb),
   'sequences',COALESCE((SELECT pg_catalog.jsonb_agg(q.metadata ORDER BY q.name)
     FROM sequences q CROSS JOIN guard g WHERE g.allowed AND q.schema_name=s.schema_name AND q.table_name=s.table_name),'[]'::jsonb),
   'partitions',COALESCE((SELECT pg_catalog.jsonb_agg(p.metadata)
     FROM partitions_safe p CROSS JOIN guard g WHERE g.allowed AND p.schema_name=s.schema_name AND p.table_name=s.table_name),'[]'::jsonb)
  ) ORDER BY s.table_name) FROM approved s CROSS JOIN guard g WHERE g.allowed),'[]'::jsonb)
 ELSE '[]'::jsonb END) AS authorized_schema_snapshot`;
export const finalManagedScope=Object.freeze([
  Object.freeze({schema:'public',table:'branches',column:null,file:'branches.schema.json'}),
  Object.freeze({schema:'public',table:'branch_activity_transactions',column:null,file:'branch-activity-transactions.schema.json'}),
  Object.freeze({schema:'public',table:'branch_distributor_profit',column:null,file:'branch-distributor-profit.schema.json'}),
  Object.freeze({schema:'public',table:'users',column:'additional_roles',file:'users-additional-roles.schema.json'})
]);
export const finalManagedRelations=Object.freeze(['information_schema.columns','pg_catalog.pg_namespace',
  'pg_catalog.pg_class','pg_catalog.pg_attribute','pg_catalog.pg_constraint','pg_catalog.pg_index',
  'pg_catalog.pg_depend','pg_catalog.pg_sequence','pg_catalog.pg_inherits']);
export function finalScopeBindings(nonce) {
  if(typeof nonce!=='string'||!/^[a-f0-9-]{32,64}$/i.test(nonce))throw Error('Invalid fingerprint nonce');
  return [nonce,'public','branches','branch_activity_transactions','branch_distributor_profit','users','additional_roles'];
}
