// Pure unit verification. The child inherits no configured application secrets;
// raw runner output (which contains private paths) is never saved or displayed.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const out='generated-artifacts/sql-architecture-final',env={NODE_ENV:'test',CI:'1'};
for(const key of ['PATH','HOME','TMPDIR','NIX_LD','NIX_LD_LIBRARY_PATH'])if(process.env[key])env[key]=process.env[key];
const runId=randomUUID(),args=['node_modules/vitest/vitest.mjs','run','--project','unit','--reporter=json'];
if(process.argv.includes('--descriptor-only'))args.push('tests/query-descriptors.unit.test.js');
const child=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
let parsed;
try{parsed=JSON.parse(child.stdout);}catch{parsed=null;}
const tests=(parsed?.testResults||[]).flatMap(s=>(s.assertionResults||[]).map(a=>({
  nameSha256:createHash('sha256').update(a.fullName).digest('hex'),status:a.status,durationMs:a.duration,
})));
const sourceFiles=['api/services/queryDescriptors.js','scripts/lib/sql-descriptor-compiler.mjs',
  'scripts/security-query-architecture.mjs','scripts/security-descriptor-unit-check.mjs','tests/query-descriptors.unit.test.js'];
const sourceHashes={};
for(const file of sourceFiles)sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const result={runId,at:new Date().toISOString(),scope:'pure unit tests; no database, HTTP, browser or production evidence',
  status:child.status===0&&parsed?.success?'PASS':'FAIL',exitCode:child.status,
  total:parsed?.numTotalTests??0,passed:parsed?.numPassedTests??0,failed:parsed?.numFailedTests??0,
  failedSuites:parsed?.numFailedTestSuites??0,timedOut:child.error?.code==='ETIMEDOUT',
  command:['node',...args].join(' '),sourceHashes,tests};
await fs.mkdir(out+'/unit-runs',{recursive:true});
await fs.writeFile(out+'/unit-runs/'+runId+'.json',JSON.stringify(result,null,2)+'\n');
await fs.writeFile(out+'/unit-summary.json',JSON.stringify({...result,tests:undefined,evidence:'unit-runs/'+runId+'.json'},null,2)+'\n');
console.log(JSON.stringify({status:result.status,total:result.total,passed:result.passed,failed:result.failed,failedSuites:result.failedSuites,runId}));
if(result.status!=='PASS')process.exitCode=1;
