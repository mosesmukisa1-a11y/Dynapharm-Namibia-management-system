// Immutable owner-authorized scope. No application relation is a query source.
export const defaultQueryId='final-four-status-defaults-v1';
export const defaultScope=['stock_status','prescription_status','consultation_status','reporting_status'];
export const defaultParams=['public','branch_activity_transactions',...defaultScope];
export const defaultSql=`WITH guard AS MATERIALIZED (
 SELECT pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
   pg_catalog.pg_is_in_recovery() AS in_recovery,
   pg_catalog.statement_timestamp() AS captured_at,
   (pg_catalog.current_setting('transaction_read_only')='on'
     AND pg_catalog.pg_is_in_recovery()=true) AS allowed
), defaults AS MATERIALIZED (
 SELECT a.attname AS column_name,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
 FROM guard g
 JOIN pg_catalog.pg_namespace n ON g.allowed AND n.nspname=$1::text
 JOIN pg_catalog.pg_class t ON t.relnamespace=n.oid AND t.relname=$2::text
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid
 LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 WHERE g.allowed AND a.attnum>0 AND NOT a.attisdropped
   AND a.attname IN ($3::text,$4::text,$5::text,$6::text)
)
SELECT pg_catalog.jsonb_build_object(
 'guard',pg_catalog.jsonb_build_object('allowed',g.allowed,
   'transaction_read_only',g.transaction_read_only,'in_recovery',g.in_recovery,
   'captured_at',g.captured_at),
 'defaults',COALESCE((SELECT pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('column_name',d.column_name,'default_expression',d.default_expression)
   ORDER BY d.column_name) FROM defaults d CROSS JOIN guard checked WHERE checked.allowed),'[]'::jsonb)
) AS evidence FROM guard g`;
