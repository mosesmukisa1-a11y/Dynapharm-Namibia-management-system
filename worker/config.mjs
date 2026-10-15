import {TASKS} from './tasks.mjs';
const extra=['WORKER_ENABLED','WORKER_TIMEZONE','WORKER_DATABASE_URL','WORKER_SCOPE','WORKER_MAX_ATTEMPTS',
  'WORKER_TIMEOUT_MS','WORKER_BACKOFF_MS','WORKER_POLL_MS'];
export function workerConfig(env={}){
  for(const name of Object.keys(env))
    if(name.startsWith('WORKER_')&&!extra.includes(name)&&!TASKS.some(t=>t.flag===name))
      throw Error('Unknown worker setting: '+name);
  const bool=name=>{const v=env[name];if(v!==undefined&&!['true','false'].includes(v))throw Error('Invalid worker boolean: '+name);return v==='true';};
  const enabled=bool('WORKER_ENABLED');
  const jobs=TASKS.filter(t=>{
    const on=bool(t.flag);
    if(on&&t.status!=='ENABLED')throw Error('Worker task quarantined: '+t.id);
    return on;
  });
  if(jobs.length&&!enabled)throw Error('Task flags require WORKER_ENABLED=true');
  const timezone=env.WORKER_TIMEZONE||'Africa/Windhoek';
  if(timezone!=='Africa/Windhoek')throw Error('Worker timezone must be Africa/Windhoek');
  const scope=(env.WORKER_SCOPE||'').split(',').filter(Boolean).map(s=>{
    const m=/^(branch|warehouse):([A-Za-z0-9_-]{1,100})$/.exec(s);
    if(!m)throw Error('Invalid typed worker scope');
    return Object.freeze({type:m[1],id:m[2]});
  }).sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id));
  if(new Set(scope.map(s=>s.type+':'+s.id)).size!==scope.length)throw Error('Duplicate worker scope');
  if(jobs.length&&(!scope.length||!env.WORKER_DATABASE_URL))throw Error('Enabled task requires explicit worker credentials and typed scope');
  const number=(name,fallback,min,max)=>{const v=env[name]===undefined?fallback:Number(env[name]);
    if(!Number.isInteger(v)||v<min||v>max)throw Error('Invalid bounded worker setting: '+name);return v;};
  return Object.freeze({enabled,jobs:Object.freeze(jobs),scope:Object.freeze(scope),timezone,databaseUrl:env.WORKER_DATABASE_URL,
    maxAttempts:number('WORKER_MAX_ATTEMPTS',3,1,5),timeoutMs:number('WORKER_TIMEOUT_MS',10000,10,60000),
    backoffMs:number('WORKER_BACKOFF_MS',250,1,30000),pollMs:number('WORKER_POLL_MS',15000,1000,60000)});
}
