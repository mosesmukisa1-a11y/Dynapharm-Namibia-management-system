import {randomUUID,createHash} from 'node:crypto';
import {TASK_BY_ID} from './tasks.mjs';
import {detectDrift} from './drift.mjs';
import {windhoekParts,workerEvent} from './dates.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const cancelled=()=>Object.assign(Error('Worker cancelled'),{code:'WORKER_CANCELLED'});
const timeout=()=>Object.assign(Error('Worker deadline exceeded'),{code:'WORKER_TIMEOUT'});
export function identity(task,date,scope){
  const scopeHash=digest(JSON.stringify([...scope].sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id))));
  const key=digest(`stock-worker:v1:${task}:${date}:${scopeHash}`);
  const lockHash=digest('stock-worker-task:'+task.replace(/:dry-run$/,''));
  return {key,scopeHash,lock:BigInt.asIntN(64,BigInt('0x'+lockHash.slice(0,16))).toString()};
}
export async function runTask({pool,config,taskId,businessDate=windhoekParts().date,
  dryRun=false,signal,log=event=>console.info(JSON.stringify(event)),testImplementation}){
  const task=TASK_BY_ID.get(taskId);
  if(!task||task.status!=='ENABLED'||!config.enabled||!config.jobs.some(t=>t.id===taskId))
    throw Error('Worker task not authorized');
  if(businessDate!==windhoekParts().date)throw Error('Historical worker invocation refused');
  if(testImplementation&&!(process.env.NODE_ENV==='test'&&process.env.STOCK_AUDIT_ISOLATED==='1'))
    throw Error('Fault injection is isolated-test only');
  const impl=testImplementation||detectDrift,{key,scopeHash,lock}=identity(taskId+(dryRun?':dry-run':''),businessDate,config.scope);
  const client=await pool.connect();let locked=false;
  const emit=(kind,detail={})=>log(workerEvent({kind,taskId,businessDate,correlationId:key,serviceActor:'stock-worker',...detail}));
  let id;
  async function event(kind,attempt,detail={},emitNow=true){
    await client.query(`INSERT INTO stock_worker_events(id,run_id,kind,attempt,business_date,detail)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(run_id,kind,attempt) DO NOTHING`,
    [randomUUID(),id,kind,attempt,businessDate,JSON.stringify(detail)]);
    if(emitNow)emit(kind,{runId:id,attempt,...detail});
  }
  try{
    locked=(await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked',[lock])).rows[0].locked;
    if(!locked){emit('skip',{reason:'distributed_lock_busy'});return {status:'skipped',reason:'locked'};}
    await client.query(`INSERT INTO stock_worker_runs(id,idempotency_key,task_id,business_date,scope_hash,service_actor,status)
      VALUES($1,$2,$3,$4,$5,'stock-worker','pending') ON CONFLICT(idempotency_key) DO NOTHING`,
    [randomUUID(),key,taskId,businessDate,scopeHash]);
    let run=(await client.query('SELECT * FROM stock_worker_runs WHERE idempotency_key=$1',[key])).rows[0];id=run.id;
    if(['succeeded','dry_run'].includes(run.status)){
      await event('skip',run.attempts,{reason:'already_completed'});return {status:'skipped',runId:id,reason:'completed'};
    }
    if(run.attempts>=config.maxAttempts){emit('skip',{runId:id,reason:'retry_budget_exhausted'});return {status:'failed',runId:id};}
    while(run.attempts<config.maxAttempts){
      if(signal?.aborted)throw cancelled();
      if(run.next_retry_at&&new Date(run.next_retry_at)>new Date()){
        const wait=Math.min(new Date(run.next_retry_at)-Date.now(),config.backoffMs*2**config.maxAttempts);
        await new Promise(r=>setTimeout(r,wait));
      }
      if(signal?.aborted){await event('cancelled',run.attempts,{reason:'shutdown_between_attempts'});return {status:'cancelled',runId:id};}
      const attempt=run.attempts+1,abort=new AbortController(),deadline=Date.now()+config.timeoutMs;
      const abortOnShutdown=()=>abort.abort(cancelled());signal?.addEventListener('abort',abortOnShutdown,{once:true});
      let timer,rowsRead=0,rowsWritten=0;
      await client.query('BEGIN');
      await client.query("UPDATE stock_worker_runs SET status='running',attempts=$2,next_retry_at=NULL WHERE id=$1",[id,attempt]);
      await event('start',attempt,{dryRun});await client.query('COMMIT');
      try{
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        const check=()=>{if(abort.signal.aborted)throw abort.signal.reason||cancelled();if(Date.now()>=deadline)throw timeout();};
        const query=async(sql,args)=>{
          check();await client.query("SELECT set_config('statement_timeout',$1,true)",[String(Math.max(1,deadline-Date.now()))]);
          const r=await client.query(sql,args);check();return r;
        };
        const ctx={scope:config.scope,signal:abort.signal,
          read:async(sql,args)=>{
            if(!/^\s*(SELECT|WITH)\b/i.test(sql)||/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|pg_notify|nextval|setval)\b/i.test(sql))
              throw Error('Worker read interface rejected non-read SQL');
            const r=await query(sql,args);rowsRead+=r.rowCount;return r;
          },
          finding:async f=>{
            check();if(!config.scope.some(s=>s.type===f.type&&s.id===f.id))throw Error('Finding scope denied');
            const r=await query(`INSERT INTO stock_worker_findings
              (id,run_id,location_type,location_id,product_name,finding_type,cached_quantity,known_physical_quantity,difference)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(run_id,location_type,location_id,product_name) DO NOTHING`,
            [randomUUID(),id,f.type,f.id,f.product_name,f.finding_type,f.cached_quantity,f.known_physical_quantity,f.difference]);
            rowsWritten+=r.rowCount;
          }};
        await Promise.race([impl(ctx),new Promise((_,reject)=>{
          timer=setTimeout(()=>{abort.abort(timeout());reject(timeout());},config.timeoutMs);
        })]);clearTimeout(timer);check();
        if(dryRun){
          await client.query('ROLLBACK');
          await client.query("UPDATE stock_worker_runs SET status='dry_run',rows_read=$2,rows_written=0,finished_at=NOW() WHERE id=$1",[id,rowsRead]);
          await event('dry_run',attempt,{rowsRead,rowsWritten:0,wouldWrite:rowsWritten});
          return {status:'dry_run',runId:id,rowsRead,rowsWritten:0};
        }
        await client.query("UPDATE stock_worker_runs SET status='succeeded',rows_read=$2,rows_written=$3,finished_at=NOW() WHERE id=$1",[id,rowsRead,rowsWritten]);
        await event('success',attempt,{rowsRead,rowsWritten},false);
        await client.query('COMMIT');
        emit('success',{runId:id,attempt,rowsRead,rowsWritten});
        return {status:'succeeded',runId:id,rowsRead,rowsWritten};
      }catch(error){
        clearTimeout(timer);abort.abort(error);
        try{await client.query('ROLLBACK');}catch{/* Disconnect releases session lock; next process resumes journal. */}
        // A lost COMMIT acknowledgement must not overwrite a committed success.
        const confirmed=await client.query('SELECT status FROM stock_worker_runs WHERE id=$1',[id]);
        if(confirmed.rows[0]?.status==='succeeded'){emit('success',{runId:id,attempt,recoveredCommit:true});return {status:'succeeded',runId:id};}
        const stop=signal?.aborted||error.code==='WORKER_CANCELLED';
        const delay=config.backoffMs*2**(attempt-1),retry=attempt<config.maxAttempts&&!stop;
        await client.query(`UPDATE stock_worker_runs SET status=$2,next_retry_at=$3 WHERE id=$1`,
          [id,stop?'cancelled':'failed',retry?new Date(Date.now()+delay):null]);
        const safeCode=/^[A-Z0-9_]{2,40}$/.test(error.code||'')?error.code:'TASK_FAILED';
        await event(stop?'cancelled':'failure',attempt,{errorCode:safeCode,rowsRead,rowsWritten:0,retry});
        await event('failure_alert',attempt,{errorCode:safeCode,delivery:'durable-journal-and-structured-stderr'});
        if(!retry)return {status:stop?'cancelled':'failed',runId:id};
        run={...run,attempts:attempt,next_retry_at:new Date(Date.now()+delay)};
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abortOnShutdown);}
    }
  }finally{
    if(locked)await client.query('SELECT pg_advisory_unlock($1::bigint)',[lock]).catch(()=>{});
    client.release();
  }
}
