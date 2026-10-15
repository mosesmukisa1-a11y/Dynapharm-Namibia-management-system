export const JOURNAL_TABLES=['stock_worker_runs','stock_worker_events','stock_worker_findings'];
export const SOURCE_TABLES=['branches','warehouse_locations','inventory_balances','stock_batches','branch_inventory_batches'];
const columns={
  stock_worker_runs:['id','idempotency_key','task_id','business_date','scope_hash','service_actor','status','attempts','next_retry_at','rows_read','rows_written','finished_at'],
  stock_worker_events:['id','run_id','kind','attempt','business_date','detail'],
  stock_worker_findings:['id','run_id','location_type','location_id','product_name','finding_type','cached_quantity','known_physical_quantity','difference'],
  branches:['id','status'],warehouse_locations:['id','status'],
  inventory_balances:['location_id','location_type','product_name','closing_qty'],
  stock_batches:['warehouse_id','description','remaining_quantity'],
  branch_inventory_batches:['branch_id','product_name','quantity'],
};
export async function workerReadiness(pool){
  const metadata=await pool.query(`SELECT c.relname,a.attname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped`);
  for(const [table,names]of Object.entries(columns))for(const name of names)
    if(!metadata.rows.some(r=>r.relname===table&&r.attname===name))throw Error('Worker schema contract unavailable; no automatic migration');
  const {rows}=await pool.query(`SELECT c.relname,
    has_table_privilege(c.oid,'SELECT') AS can_read,
    has_table_privilege(c.oid,'INSERT') AS can_insert,
    has_table_privilege(c.oid,'UPDATE') AS can_update,
    has_table_privilege(c.oid,'DELETE') AS can_delete
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')`);
  const map=new Map(rows.map(r=>[r.relname,r]));
  for(const name of [...JOURNAL_TABLES,...SOURCE_TABLES])if(!map.get(name)?.can_read)
    throw Error('Worker required schema/SELECT privilege unavailable');
  for(const name of JOURNAL_TABLES)if(!map.get(name)?.can_insert||
    (name==='stock_worker_runs'&&!map.get(name)?.can_update))
    throw Error('Worker journal privileges unavailable');
  for(const name of JOURNAL_TABLES)if(map.get(name).can_delete||(name!=='stock_worker_runs'&&map.get(name).can_update))
    throw Error('Worker append-only audit privileges violated');
  for(const r of rows){
    if(!JOURNAL_TABLES.includes(r.relname)&&(r.can_insert||r.can_update||r.can_delete))
      throw Error('Worker role has forbidden business write privileges');
    if(['users','clients','distributors'].includes(r.relname)&&r.can_read)
      throw Error('Worker role has unrelated identity-data privileges');
  }
  const {rows:roles}=await pool.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  if(!roles.length||Object.values(roles[0]).some(Boolean))throw Error('Privileged worker role refused');
  const privileged=await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege(p.oid,'EXECUTE')) AS unsafe_function,
    has_schema_privilege('public','CREATE') AS can_create_schema_objects`);
  if(privileged.rows[0].unsafe_function||privileged.rows[0].can_create_schema_objects)
    throw Error('Worker administrative/schema capability refused');
  return {ready:true,serviceActor:'stock-worker',schemaWrites:false};
}
