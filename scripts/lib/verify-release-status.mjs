import {releaseStatus} from '../../api/services/releaseStatus.js';
const keys=['buildDigest','schemaContractDigest','startupMode','schedulerState','workerState','readiness'];
export function compareReleaseStatus(value, expected) {
  if(!value || Object.keys(value).sort().join()!==[...keys].sort().join())throw Error('RELEASE_RESPONSE_INVALID');
  if(!['enabled','disabled'].includes(value.schedulerState)||
    !['enabled','disabled'].includes(value.workerState)||
    !['ready','not-ready'].includes(value.readiness))throw Error('RELEASE_RESPONSE_INVALID');
  const normalized=releaseStatus({buildDigest:value.buildDigest,schemaContractDigest:value.schemaContractDigest},
    {startupMode:value.startupMode,schedulerEnabled:value.schedulerState==='enabled',
      workerEnabled:value.workerState==='enabled',ready:value.readiness==='ready'});
  if(normalized.buildDigest!==expected.buildDigest)throw Error('RELEASE_DIGEST_MISMATCH');
  if(normalized.schemaContractDigest!==expected.schemaContractDigest)throw Error('RELEASE_SCHEMA_MISMATCH');
  if(normalized.startupMode!=='code-only'||normalized.schedulerState!=='disabled'||
    normalized.workerState!=='disabled'||normalized.readiness!=='ready')throw Error('RELEASE_STATE_MISMATCH');
  return {status:'PASS'};
}

export async function verifyReleaseStatus({origin,expected,timeoutMs=5000,fetchImpl=fetch}) {
  const allowed=new Set(['RELEASE_DIGEST_MISMATCH','RELEASE_SCHEMA_MISMATCH','RELEASE_STATE_MISMATCH']);
  let timer;
  const abort=new AbortController();
  try {
    releaseStatus(expected,{startupMode:'code-only',schedulerEnabled:false,workerEnabled:false,ready:true});
    const url=new URL(origin);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error();
    const work=async()=>{
      const response=await fetchImpl(new URL('/api/release-status',url),{method:'GET',redirect:'error',
        credentials:'omit',cache:'no-store',signal:abort.signal,headers:{Accept:'application/json'}});
      if(response.status!==200||!response.headers.get('content-type')?.startsWith('application/json'))throw Error();
      const reader=response.body.getReader();let text='',size=0;
      try {
        while(true) {
          const {done,value}=await reader.read();if(done)break;
          size+=value.byteLength;if(size>1024)throw Error();
          text+=new TextDecoder().decode(value);
        }
      } finally {await reader.cancel().catch(()=>{});}
      return compareReleaseStatus(JSON.parse(text),expected);
    };
    return await Promise.race([work(),new Promise((_,reject)=>{
      timer=setTimeout(()=>{abort.abort();reject(Error('TIMEOUT'));},timeoutMs);
    })]);
  } catch(error) {
    return {status:'FAIL',code:allowed.has(error.message)?error.message:'RELEASE_VERIFICATION_FAILED'};
  } finally {clearTimeout(timer);abort.abort();}
}
