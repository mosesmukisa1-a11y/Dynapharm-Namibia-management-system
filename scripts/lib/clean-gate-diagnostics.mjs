// Allowlisted metadata only. Never persist raw error messages, stdout or stderr.
import fs from 'node:fs/promises';
import path from 'node:path';
export function safeFailure(text='') {
  const categories=[];
  for(const [category,pattern] of Object.entries({
    missingModule:/Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/,
    missingFile:/ENOENT|no such file/i, assertion:/AssertionError|expected .* to /,
    timeout:/timed? ?out|Timeout/i, query:/PostgresError|DatabaseError|SQLSTATE/,
    syntax:/SyntaxError/, permission:/EACCES|permission denied/i,
  })) if(pattern.test(text))categories.push(category);
  const codes=[...new Set(text.match(/\b(?:ERR_[A-Z_]+|MODULE_NOT_FOUND|ENOENT|EACCES|ECONNREFUSED|ETIMEDOUT|42P01|42703|23505|25P02)\b/g)||[])];
  const frames=[...text.matchAll(/(?:^|\s|\()((?:file:\/\/)?[^\s()'"]+\.(?:m?js|cjs|ts|tsx)):(\d+)(?::(\d+))?/gm)]
    .map(m=>({file:sourcePath(m[1]),line:Number(m[2]),column:m[3]?Number(m[3]):null}))
    .filter(f=>f.file);
  // Only source/module paths, not arbitrary exception values or configuration.
  const missing=[...text.matchAll(/Cannot find (?:module|package) ['"]([^'"]+)['"]|ENOENT[^\n]*?['"]([^'"]+)['"]/g)]
    .map(m=>sourcePath(m[1]||m[2])).filter(Boolean);
  return {categories:categories.length?categories:['unclassified'],codes,
    missingPaths:[...new Set(missing)],frames:frames.slice(0,30)};
}
export function sourcePath(value) {
  if(typeof value!=='string'||/[@:?=\0\n]/.test(value.replace(/^file:\/\//,''))||
    /(?:secret|password|credential|\.env)/i.test(value)&&!/\.(?:m?js|ts)$/.test(value))return null;
  const match=value.match(/(?:^|\/)((?:tests|scripts|api|worker|migrations|backend|node_modules|generated-artifacts)\/[a-zA-Z0-9_./-]+)$/);
  return match?match[1]:/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(value)&&!path.isAbsolute(value)?value:null;
}
export async function collectFixtureDiagnostics(source) {
  const base=source+'/generated-artifacts/sql-runtime-enforcement-final/fixture-runs';
  const results=[];
  for(const dir of await fs.readdir(base).catch(()=>[])){
    if(!/^[a-f0-9-]{36}$/.test(dir))continue;
    const entry={runId:dir,suites:[]};
    for(const label of ['full','credential']){
      const file=base+'/'+dir+'/'+label+'-database-results.json';
      const data=await fs.readFile(file,'utf8').then(JSON.parse).catch(()=>null);
      if(!data)continue;
      const suites=(data.testResults||[]).map(s=>({
        file:sourcePath(s.name||''),status:s.status,
        tests:(s.assertionResults||[]).map(t=>({name:t.fullName,status:t.status,
          ...(t.status==='failed'?{failure:safeFailure((t.failureMessages||[]).join('\n'))}:{})})),
        ...(s.message?{failure:safeFailure(s.message),
          stage:(s.assertionResults||[]).length&&(s.assertionResults||[]).every(t=>t.status==='passed')?
            'suite hook or evidence output (assertions passed)':'setup/query/assertion (see frames)'}:{})
      }));
      entry.suites.push({label,success:data.success,total:data.numTotalTests,passed:data.numPassedTests,
        failed:data.numFailedTests,suites,
        subprocessStages:data.subprocessStages||[],
        safeSetupFailure:data.safeFailure||null,
        harnessFailure:data.harnessFailure?safeFailure(data.harnessFailure):null,
        missingResults:(data.suiteFailures||[]).map(s=>({suite:sourcePath(s.suite),category:'missing-result'}))});
      const queryFile=base+'/'+dir+'/'+label+'-results/runtime-query-coverage.jsonl';
      const coverage=await fs.readFile(queryFile,'utf8').catch(()=>'');
      const witnesses=coverage.trim()?coverage.trim().split('\n').flatMap(line=>JSON.parse(line).rows||[]):[];
      entry.suites.at(-1).stageOutcomes={
        suiteSetupAndHooks:data.success?'PASS':'See individual suite failures',
        queryObservation:{status:witnesses.some(r=>r.nativeSucceeded)?'PASS':'NOT OBSERVED',
          admittedCases:witnesses.length,nativeSuccessfulCases:witnesses.filter(r=>r.nativeSucceeded).length,
          scope:'Native successes correlated to descriptor admission; intentional query denials are not failures'},
        assertions:{passed:data.numPassedTests,failed:data.numFailedTests},
      };
      const subprocess=await fs.readFile(base+'/'+dir+'/'+label+'-database-failure.json','utf8')
        .then(JSON.parse).catch(()=>null);
      if(subprocess)entry.suites.at(-1).processFailure=subprocess.process||{category:'Unavailable in original candidate'};
    }
    for(const file of ['browser-cleanup.json','owned-tool-context-contract.json','schema-contract.json',
      'post-convergence-contract.json','schema-missing.json',
      'startup-rehearsal.json','browser-results.json','fixture-failure.json']){
      const data=await fs.readFile(base+'/'+dir+'/'+file,'utf8').then(JSON.parse).catch(()=>null);
      if(!data)continue;
      if(file==='fixture-failure.json')entry.fixtureFailure=data.failure||safeFailure(data.reason);
      else if(file==='browser-results.json')entry.browser={checks:(data.results||[]).length,
        failed:(data.results||[]).filter(r=>r.status==='FAIL'||r.result==='FAIL').length};
      else if(file==='browser-cleanup.json')entry.cleanup={
        isolatedDatabaseDropped:data.isolatedDatabaseDropped,ownedClusterStopped:data.ownedClusterStopped,
        temporaryDirectoryRemoved:data.temporaryDirectoryRemoved,childStopped:data.childStopped};
      else if(file==='startup-rehearsal.json')entry.launcher={ready:data.ready,health:data.compatibilityStatus};
      else if(file==='schema-missing.json')entry.schemaMissingCount=Array.isArray(data)?data.length:
        Array.isArray(data.missing)?data.missing.length:null;
      else if(file==='post-convergence-contract.json')entry.schemaContract={
        status:data.status,checks:(data.checks||[]).map(c=>({name:c.name,pass:c.pass}))};
      else entry[file]={status:data.status,checks:data.checks};
    }
    // Inner ownership records prove every per-suite/template database was dropped.
    const owned=base+'/'+dir+'/database-ownership';
    const records=await fs.readdir(owned).catch(()=>[]);
    entry.innerCleanup={records:records.length,verified:0};
    for(const f of records){const r=JSON.parse(await fs.readFile(owned+'/'+f,'utf8'));
      if(r.cleanupVerified===true)entry.innerCleanup.verified++;}
    results.push(entry);
  }
  return results;
}
