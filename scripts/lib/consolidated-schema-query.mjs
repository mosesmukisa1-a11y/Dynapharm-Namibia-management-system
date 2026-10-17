// One immutable owner-authorized catalog SELECT. No application relation source.
export const consolidatedQueryId='consolidated-seven-object-authority-v1';
export const consolidatedTables=['products','product_images','file_uploads','field_program_requests',
  'hr_staff_change_requests','hr_leave_requests','stock_batches'];
export const consolidatedParams=['public',...consolidatedTables,'notify_change'];
export const consolidatedSql=`WITH guard AS MATERIALIZED (
 SELECT pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
   pg_catalog.pg_is_in_recovery() AS in_recovery,pg_catalog.statement_timestamp() AS captured_at,
   (pg_catalog.current_setting('transaction_read_only')='on'
     AND pg_catalog.pg_is_in_recovery()=true) AS allowed
), requested AS MATERIALIZED (
 SELECT $1::text AS schema_name,v.table_name FROM guard g CROSS JOIN
 (VALUES($2::text),($3::text),($4::text),($5::text),($6::text),($7::text),($8::text)) v(table_name)
 WHERE g.allowed
), targets AS MATERIALIZED (
 SELECT t.oid,n.nspname AS schema_name,t.relname AS table_name,t.relkind,t.relispartition,
   t.relpartbound,t.relpersistence,t.reloptions
 FROM guard g JOIN requested r ON g.allowed
 JOIN pg_catalog.pg_namespace n ON n.nspname=r.schema_name
 JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid AND t.relname=r.table_name WHERE g.allowed
), columns AS MATERIALIZED (
 SELECT t.oid AS table_oid,a.attnum AS position,pg_catalog.jsonb_build_object(
   'column_name',a.attname,'ordinal_position',a.attnum,
   'native_type',pg_catalog.format_type(a.atttypid,a.atttypmod),
   'type_schema',nt.nspname,'type_name',ty.typname,'type_kind',ty.typtype,
   'nullable',NOT a.attnotnull,'default_expression',
     CASE WHEN a.attgenerated='' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid) ELSE NULL END,
   'generated_expression',CASE WHEN a.attgenerated<>'' THEN pg_catalog.pg_get_expr(d.adbin,d.adrelid) ELSE NULL END,
   'identity',a.attidentity,'generated',a.attgenerated,
   'character_maximum_length',CASE WHEN ty.typname IN ('varchar','bpchar') AND a.atttypmod>=4 THEN a.atttypmod-4 END,
   'numeric_precision',CASE WHEN ty.typname='numeric' AND a.atttypmod>=4 THEN ((a.atttypmod-4)>>16)&65535 END,
   'numeric_scale',CASE WHEN ty.typname='numeric' AND a.atttypmod>=4
     THEN ((a.atttypmod-4)&2047)-CASE WHEN ((a.atttypmod-4)&1024)>0 THEN 2048 ELSE 0 END END,
   'collation_schema',nc.nspname,'collation_name',co.collname
 ) AS metadata
 FROM guard g JOIN targets t ON g.allowed
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_catalog.pg_type ty ON ty.oid=a.atttypid
 JOIN pg_catalog.pg_namespace nt ON nt.oid=ty.typnamespace
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
 LEFT JOIN pg_catalog.pg_namespace nc ON nc.oid=co.collnamespace WHERE g.allowed
), constraints AS MATERIALIZED (
 SELECT t.oid AS table_oid,c.oid,c.conname,pg_catalog.jsonb_build_object(
   'name',c.conname,'type',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid,true),
   'deferrable',c.condeferrable,'deferred',c.condeferred,'validated',c.convalidated,
   'columns',ARRAY(SELECT a.attname FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY k(num,pos)
     JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.pos),
   'referenced_schema',nr.nspname,'referenced_table',rt.relname,
   'referenced_columns',ARRAY(SELECT a.attname FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY k(num,pos)
     JOIN pg_catalog.pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.pos)
 ) AS metadata FROM guard g JOIN targets t ON g.allowed
 JOIN pg_catalog.pg_constraint c ON c.conrelid=t.oid AND c.contype IN ('p','u','f','c','x')
 LEFT JOIN pg_catalog.pg_class rt ON rt.oid=c.confrelid
 LEFT JOIN pg_catalog.pg_namespace nr ON nr.oid=rt.relnamespace WHERE g.allowed
), indexes AS MATERIALIZED (
 SELECT t.oid AS table_oid,x.relname AS name,pg_catalog.jsonb_build_object(
   'name',x.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
   'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,
   'key_count',i.indnkeyatts,'total_columns',i.indnatts,
   'predicate',pg_catalog.pg_get_expr(i.indpred,i.indrelid,true),
   'expressions',pg_catalog.pg_get_expr(i.indexprs,i.indrelid,true),
   'columns',ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid,k.num,true)
     FROM pg_catalog.generate_series(1,i.indnatts) k(num) ORDER BY k.num)
 ) AS metadata FROM guard g JOIN targets t ON g.allowed
 JOIN pg_catalog.pg_index i ON i.indrelid=t.oid
 JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid WHERE g.allowed
), sequences AS MATERIALIZED (
 SELECT t.oid AS table_oid,x.oid AS sequence_oid,pg_catalog.jsonb_build_object(
   'schema',nx.nspname,'name',x.relname,'column_name',a.attname,'ownership',d.deptype,
   'type',pg_catalog.format_type(q.seqtypid,0),'start',q.seqstart,'increment',q.seqincrement,
   'minimum',q.seqmin,'maximum',q.seqmax,'cache',q.seqcache,'cycle',q.seqcycle
 ) AS metadata FROM guard g JOIN targets t ON g.allowed
 JOIN pg_catalog.pg_depend d ON d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid=t.oid
   AND d.classid='pg_catalog.pg_class'::regclass AND d.deptype IN ('a','i')
 JOIN pg_catalog.pg_class x ON x.oid=d.objid AND x.relkind='S'
 JOIN pg_catalog.pg_namespace nx ON nx.oid=x.relnamespace
 JOIN pg_catalog.pg_sequence q ON q.seqrelid=x.oid
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE g.allowed
), triggers AS MATERIALIZED (
 SELECT t.oid AS table_oid,tg.oid,tg.tgfoid,tg.tgisinternal,tg.tgname,pg_catalog.jsonb_build_object(
   'name',tg.tgname,'internal',tg.tgisinternal,'enabled',tg.tgenabled,
   'definition',pg_catalog.pg_get_triggerdef(tg.oid,true),
   'function_schema',np.nspname,'function_name',p.proname,
   'function_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid)
 ) AS metadata FROM guard g JOIN targets t ON g.allowed
 JOIN pg_catalog.pg_trigger tg ON tg.tgrelid=t.oid
 JOIN pg_catalog.pg_proc p ON p.oid=tg.tgfoid
 JOIN pg_catalog.pg_namespace np ON np.oid=p.pronamespace WHERE g.allowed
), selected_procs AS MATERIALIZED (
 SELECT p.oid FROM guard g JOIN pg_catalog.pg_proc p ON g.allowed AND p.prokind='f'
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE g.allowed AND ((n.nspname=$1::text AND p.proname=$9::text)
   OR p.oid IN (SELECT tgfoid FROM triggers WHERE NOT tgisinternal))
), functions AS MATERIALIZED (
 SELECT p.oid,pg_catalog.jsonb_build_object('schema',n.nspname,'name',p.proname,
   'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
   'arguments',pg_catalog.pg_get_function_arguments(p.oid),
   'return_type',pg_catalog.pg_get_function_result(p.oid),'language',l.lanname,
   'volatility',p.provolatile,'security_definer',p.prosecdef,'strict',p.proisstrict,
   'definition',pg_catalog.pg_get_functiondef(p.oid)) AS metadata
 FROM guard g JOIN selected_procs s ON g.allowed
 JOIN pg_catalog.pg_proc p ON p.oid=s.oid
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE g.allowed
), source_objects AS MATERIALIZED (
 SELECT 'pg_catalog.pg_class'::regclass AS classid,t.oid AS objid,0 AS subid,'table'::text AS kind FROM targets t CROSS JOIN guard g WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_attrdef'::regclass,d.oid,0,'column_expression'
   FROM targets t CROSS JOIN guard g JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_constraint'::regclass,c.oid,0,'constraint' FROM constraints c CROSS JOIN guard g WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_trigger'::regclass,t.oid,0,'trigger' FROM triggers t CROSS JOIN guard g WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_proc'::regclass,f.oid,0,'function' FROM functions f CROSS JOIN guard g WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_class'::regclass,i.indexrelid,0,'index'
   FROM targets t CROSS JOIN guard g JOIN pg_catalog.pg_index i ON i.indrelid=t.oid WHERE g.allowed
 UNION ALL SELECT 'pg_catalog.pg_class'::regclass,s.sequence_oid,0,'sequence' FROM sequences s CROSS JOIN guard g WHERE g.allowed
), dependencies AS MATERIALIZED (
 SELECT DISTINCT pg_catalog.jsonb_build_object('source_kind',s.kind,
   'source',src.identity,'source_type',src.type,
   'dependency_type',d.deptype,'referenced_class',d.refclassid::regclass::text,
   'referenced',ref.identity,'referenced_type',ref.type,'referenced_schema',ref.schema,
   'referenced_name',ref.name) AS metadata
 FROM guard g JOIN source_objects s ON g.allowed
 JOIN pg_catalog.pg_depend d ON d.classid=s.classid AND d.objid=s.objid
 CROSS JOIN LATERAL pg_catalog.pg_identify_object(s.classid,s.objid,s.subid) src
 CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) ref
 WHERE g.allowed AND d.refclassid IN ('pg_catalog.pg_class'::regclass,'pg_catalog.pg_proc'::regclass,
   'pg_catalog.pg_type'::regclass,'pg_catalog.pg_namespace'::regclass,'pg_catalog.pg_collation'::regclass,
   'pg_catalog.pg_operator'::regclass,'pg_catalog.pg_language'::regclass,'pg_catalog.pg_constraint'::regclass,
   'pg_catalog.pg_extension'::regclass,'pg_catalog.pg_opclass'::regclass,'pg_catalog.pg_opfamily'::regclass,
   'pg_catalog.pg_rewrite'::regclass)
), table_metadata AS MATERIALIZED (
 SELECT r.table_name,pg_catalog.jsonb_build_object('schema',r.schema_name,'table',r.table_name,
   'exists',t.oid IS NOT NULL,'relkind',t.relkind,'is_partition',t.relispartition,
   'persistence',t.relpersistence,'options',t.reloptions,
   'partition_key',CASE WHEN t.relkind='p' THEN pg_catalog.pg_get_partkeydef(t.oid) END,
   'partition_bound',pg_catalog.pg_get_expr(t.relpartbound,t.oid,true),
   'partition_children',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'schema',cn.nspname,'table',ct.relname,'is_partition',ct.relispartition))
     FROM pg_catalog.pg_inherits inh JOIN pg_catalog.pg_class ct ON ct.oid=inh.inhrelid
     JOIN pg_catalog.pg_namespace cn ON cn.oid=ct.relnamespace WHERE inh.inhparent=t.oid),'[]'::jsonb),
   'partition_parents',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'schema',pn.nspname,'table',pt.relname)) FROM pg_catalog.pg_inherits inh
     JOIN pg_catalog.pg_class pt ON pt.oid=inh.inhparent
     JOIN pg_catalog.pg_namespace pn ON pn.oid=pt.relnamespace WHERE inh.inhrelid=t.oid),'[]'::jsonb),
   'columns',COALESCE((SELECT pg_catalog.jsonb_agg(c.metadata ORDER BY c.position) FROM columns c WHERE c.table_oid=t.oid),'[]'::jsonb),
   'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(c.metadata ORDER BY c.conname) FROM constraints c WHERE c.table_oid=t.oid),'[]'::jsonb),
   'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(i.metadata ORDER BY i.name) FROM indexes i WHERE i.table_oid=t.oid),'[]'::jsonb),
   'sequences',COALESCE((SELECT pg_catalog.jsonb_agg(s.metadata ORDER BY s.sequence_oid) FROM sequences s WHERE s.table_oid=t.oid),'[]'::jsonb),
   'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(tr.metadata ORDER BY tr.tgname) FROM triggers tr WHERE tr.table_oid=t.oid),'[]'::jsonb)
 ) AS metadata FROM guard g JOIN requested r ON g.allowed
 LEFT JOIN targets t ON t.schema_name=r.schema_name AND t.table_name=r.table_name WHERE g.allowed
)
SELECT pg_catalog.jsonb_build_object('guard',pg_catalog.jsonb_build_object(
 'allowed',g.allowed,'transaction_read_only',g.transaction_read_only,'in_recovery',g.in_recovery,'captured_at',g.captured_at),
 'tables',COALESCE((SELECT pg_catalog.jsonb_agg(t.metadata ORDER BY t.table_name) FROM table_metadata t CROSS JOIN guard checked WHERE checked.allowed),'[]'::jsonb),
 'functions',COALESCE((SELECT pg_catalog.jsonb_agg(f.metadata) FROM functions f CROSS JOIN guard checked WHERE checked.allowed),'[]'::jsonb),
 'dependencies',COALESCE((SELECT pg_catalog.jsonb_agg(d.metadata) FROM dependencies d CROSS JOIN guard checked WHERE checked.allowed),'[]'::jsonb)
) AS evidence FROM guard g`;
