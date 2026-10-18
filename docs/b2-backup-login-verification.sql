-- PREPARED ONLY. Never executed during preparation.
-- Fixed SELECT; private executor binds $1 expected database name, $2 frozen schemas text[].
-- Connect FRESH as the new login with verified TLS; no PGOPTIONS/read-only startup override.
-- Require exactly one row, every boolean true, expected server major and frozen scope counts.
WITH me AS (
  SELECT oid, rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
         rolreplication, rolbypassrls, rolinherit, rolconnlimit, rolvaliduntil
  FROM pg_catalog.pg_roles
  WHERE rolname = session_user
), scope AS (
  SELECT n.oid
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname = ANY($2::text[])
), relations AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_catalog.pg_class c JOIN scope s ON s.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f','S')
)
SELECT
  session_user = 'dynapharm_backup_ro' AND current_user = session_user AS exact_login,
  current_database() = $1::text AS private_database_identity_matches,
  pg_is_in_recovery() AS recovery_replica,
  current_setting('transaction_read_only') = 'on' AS transaction_read_only,
  current_setting('default_transaction_read_only') = 'on' AS role_read_only_default,
  current_setting('statement_timeout')::interval > interval '0'
    AND current_setting('statement_timeout')::interval <= interval '120 seconds' AS statement_timeout_bounded,
  current_setting('lock_timeout')::interval > interval '0'
    AND current_setting('lock_timeout')::interval <= interval '5 seconds' AS lock_timeout_bounded,
  current_setting('idle_in_transaction_session_timeout')::interval > interval '0'
    AND current_setting('idle_in_transaction_session_timeout')::interval <= interval '30 seconds' AS idle_timeout_bounded,
  (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolconnlimit = 1
    AND rolvaliduntil > clock_timestamp()
    AND rolvaliduntil <= clock_timestamp() + interval '2 hours' FROM me) AS minimal_role_attributes,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members a JOIN me ON me.oid = a.member) AS no_role_memberships,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend d JOIN me ON me.oid = d.refobjid
    WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass AND d.deptype = 'o') AS owns_no_objects,
  has_database_privilege(current_database(), 'CONNECT') AS can_connect,
  NOT has_database_privilege(current_database(), 'CREATE,TEMPORARY') AS no_database_ddl_privileges,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database d
    WHERE d.datallowconn AND d.datname <> current_database() AND has_database_privilege(d.oid, 'CONNECT')) AS no_other_database_connect,
  cardinality($2::text[]) > 0
    AND (SELECT count(*) FROM scope) = cardinality($2::text[]) AS exact_schema_scope_exists,
  NOT EXISTS (SELECT 1 FROM scope WHERE NOT has_schema_privilege(oid, 'USAGE')) AS schema_usage_complete,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE has_schema_privilege(oid, 'CREATE')) AS no_schema_create,
  NOT EXISTS (SELECT 1 FROM relations WHERE relkind <> 'S'
    AND NOT has_table_privilege(oid, 'SELECT')) AS table_select_complete,
  NOT EXISTS (SELECT 1 FROM relations WHERE relkind = 'S'
    AND NOT has_sequence_privilege(oid, 'SELECT')) AS sequence_select_complete,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind IN ('r','p','v','m','f')
    AND (has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(c.oid, 'INSERT,UPDATE,REFERENCES'))) AS no_table_or_column_write_privileges,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relkind = 'S'
    AND has_sequence_privilege(c.oid, 'USAGE,UPDATE')) AS no_sequence_mutation_privileges,
  NOT EXISTS (SELECT 1 FROM relations WHERE relrowsecurity) AS no_rls_backup_gap,
  NOT EXISTS (SELECT 1 FROM relations WHERE relkind = 'f') AS no_unhandled_foreign_data,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata l
    WHERE NOT has_largeobject_privilege(l.oid, 'SELECT')) AS large_object_select_complete,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata l
    WHERE has_largeobject_privilege(l.oid, 'UPDATE')) AS no_large_object_update_privilege,
  NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND has_function_privilege(p.oid, 'EXECUTE')) AS no_unreviewed_application_routine_execution,
  EXISTS (SELECT 1 FROM pg_catalog.pg_stat_ssl s
    WHERE s.pid = pg_backend_pid() AND s.ssl AND s.bits >= 128
      AND s.version IN ('TLSv1.2','TLSv1.3')) AS transport_tls_active,
  current_setting('server_version_num')::integer / 10000 AS server_major,
  (SELECT count(*) FROM scope) AS approved_schema_count,
  (SELECT count(*) FROM relations WHERE relkind <> 'S') AS approved_relation_count,
  (SELECT count(*) FROM relations WHERE relkind = 'S') AS approved_sequence_count,
  (SELECT count(*) FROM pg_catalog.pg_largeobject_metadata) AS large_object_count;
