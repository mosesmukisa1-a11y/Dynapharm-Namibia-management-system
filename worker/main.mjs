import {createWorkerDatabase} from './database.mjs';
import {workerConfig} from './config.mjs';
import {workerReadiness} from './readiness.mjs';
import {runTask} from './runner.mjs';
import {dueSlot,workerEvent} from './dates.mjs';
const config=workerConfig(process.env),args=process.argv.slice(2);
const allowed=/^(--once|--dry-run|--check-config|--task=drift-detection)$/;
if(args.some(a=>!allowed.test(a)))throw Error('Unsupported worker command');
if(args.includes('--once')&&(!config.enabled||!config.jobs.length))throw Error('Explicit invocation requires enabled allowlisted task');
const log=e=>{const line=JSON.stringify(e);if(e.kind==='failure_alert')console.error(line);else console.info(line);};
if(args.includes('--check-config')||!config.enabled||!config.jobs.length){
  log(workerEvent({kind:'worker.disabled',enabled:config.enabled,tasks:config.jobs.map(t=>t.id),timersStarted:false}));
}else{
  // No web DATABASE_URL fallback. This identity must be least-privileged.
  const pool=createWorkerDatabase({connectionString:config.databaseUrl,max:3,connectionTimeoutMillis:5000,
    query_timeout:config.timeoutMs+1000});
  pool.on('error',()=>log(workerEvent({kind:'failure_alert',errorCode:'WORKER_CONNECTION_LOST'})));
  const abort=new AbortController();let timer,busy=null,lastSlot,closing;
  const end=()=>closing??=pool.end();
  async function stop(){abort.abort();clearInterval(timer);await busy?.catch(()=>{});await end();}
  process.once('SIGTERM',()=>stop().then(()=>{process.exitCode=0;}));
  process.once('SIGINT',()=>stop().then(()=>{process.exitCode=0;}));
  try{
    await workerReadiness(pool);
    log(workerEvent({kind:'worker.ready',serviceActor:'stock-worker',tasks:config.jobs.map(t=>t.id),schemaWrites:false}));
    const tick=async explicit=>{
      for(const task of config.jobs){
        const slot=explicit?undefined:dueSlot(task.id);
        if(!explicit&&(!slot||lastSlot===task.id+slot))continue;
        if(slot)lastSlot=task.id+slot;
        const result=await runTask({pool,config,taskId:task.id,businessDate:slot,
          dryRun:args.includes('--dry-run'),signal:abort.signal,log});
        if(['failed','cancelled'].includes(result.status))process.exitCode=1;
      }
    };
    if(args.includes('--once')){
      busy=tick(true);await busy;await end();
    }else{
      // No startup backfill or immediate task run. Only a matching Windhoek slot.
      timer=setInterval(()=>{if(!busy&&!abort.signal.aborted){
        busy=tick(false).catch(()=>{log(workerEvent({kind:'failure_alert',errorCode:'WORKER_COORDINATOR_FAILED'}));})
          .finally(()=>{busy=null;});
      }},config.pollMs);
    }
  }catch{
    clearInterval(timer);await end();
    log(workerEvent({kind:'worker.not_ready',errorCode:'WORKER_SCHEMA_OR_SERVICE_AUTH_FAILED',schemaWrites:false}));
    process.exitCode=1;
  }
}
