// Offline evidence assembly only. Never imports the app, pg, credentials,
// connectors, deployment controls, background workers, or database adapters.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='generated-artifacts/sql-architecture-final',sha=v=>createHash('sha256').update(v).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const prior=await read('generated-artifacts/sql-security-final-closure/sql-location-inventory.json');
const coverage=await read(out+'/compiler-coverage.json'),unit=await read(out+'/unit-summary.json');
// Remove runner display names from earlier local evidence: parameterized test
// titles are not an approved channel for secret/path/privacy canaries.
for(const file of await fs.readdir(out+'/unit-runs')){
  if(!/^[a-f0-9-]+\.json$/.test(file))continue;
  const report=await read(out+'/unit-runs/'+file);
  for(const test of report.tests||[]){
    if(typeof test.name==='string'){test.nameSha256=sha(test.name);delete test.name;}
  }
  await fs.writeFile(out+'/unit-runs/'+file,JSON.stringify(report,null,2)+'\n');
}
const pending=prior.records.filter(r=>r.priorClassification==='unresolved blocker');
if(pending.length!==61)throw Error('Retained inventory identity/count mismatch');
const records=[];
for(const r of pending){
  const candidates=coverage.locations.filter(c=>c.file===r.file&&
    r.currentFamilyCandidates?.some(x=>x.line===c.line&&x.column===c.column));
  records.push({
    originalIdentity:r.originalLocation,originalFunction:r.function,originalCallFamily:r.callFamily,
    originalSourceSha256:r.originalSourceSha256,
    currentFile:r.file,currentSourceSha256:sha(await fs.readFile(r.file)),
    currentCandidates:(r.currentFamilyCandidates||[]).map(c=>({line:c.line,column:c.column,callee:c.callee,argumentSha256:c.argumentSha256})),
    retainedCallerChain:r.originalProductionReachability,
    compilerCandidates:candidates,
    registeredProductionQueryId:null,runtimeBoundaryConnected:false,
    hostileNativeHandlerTest:null,
    disposition:'NOT CLOSED - RELEASE BLOCKER',
    reason:'The isolated descriptor library is not connected to api/db.js; source-translation suggestions are not endpoint or native-database enforcement evidence.',
  });
}
await fs.writeFile(out+'/retained-61-closure.json',JSON.stringify({
  status:'BLOCKED - DO NOT PUBLISH',originalCount:61,closed:0,unresolved:61,records,
},null,2)+'\n');
const changed=['api/services/queryDescriptors.js','scripts/lib/sql-descriptor-compiler.mjs',
  'scripts/security-query-architecture.mjs','scripts/security-descriptor-unit-check.mjs',
  'scripts/security-query-architecture-report.mjs','tests/query-descriptors.unit.test.js',
  '.agents/memory/security-boundary-compatibility.md'];
const files=[];
for(const file of changed)files.push({file,sha256:sha(await fs.readFile(file))});
await fs.writeFile(out+'/changed-files.json',JSON.stringify({files,installableArchivePrepared:false},null,2)+'\n');
const safety=`Production database accessed: NO
Production database modified: NO
Production migration applied: NO
Production passwords rotated: NO
Production sessions invalidated: NO
Production environment modified: NO
Production restarted: NO
Production scheduler stopped: NO
Production worker activated: NO
Production published: NO`;
const report=`# SQL architecture closure — incremental offline evidence

**BLOCKED - DO NOT PUBLISH**

Generated: ${new Date().toISOString()}

## Accurate scope

This increment adds an isolated descriptor-admission library, a **review-only**
source translator, and pure unit tests. It does **not** complete the requested
application-wide SQL migration. No application entry point, request dispatcher,
database executor, existing handler, transaction wrapper, startup launcher, or
worker is switched to the new library. Existing application behavior and retained
fixes are therefore not intentionally changed.

The generic production executor and its legacy callers remain unresolved.
There is no claim that application requests now reject plain SQL strings.
The restricted facade is tested in isolation, not installed in withTransaction.
No raw-string fallback, loader, catalog auto-installer, package/dependency change,
or release/archive command has been introduced.

## Newly observed checks

| Check | Result | Evidence and limitation |
|---|---|---|
| Complete existing unit project plus new descriptor cases | ${unit.status} | ${unit.passed}/${unit.total}; ${unit.failed} failing tests, ${unit.failedSuites} failing suites. Pure unit evidence only. |
| New descriptor cases | PASS | 24 cases in tests/query-descriptors.unit.test.js; these do not run HTTP handlers or native SQL. |
| Source translator review | BLOCKED | ${coverage.modules} modules reviewed, ${coverage.registeredPlans} **candidate** plans, ${coverage.issues.length} rejected constructions. No emitted runtime modules are executed. |
| Original 61 release identities | FAIL / NOT CLOSED | 0 closed, 61 unresolved; retained-61-closure.json preserves identities, candidates and caller chains. |
| Production-facing generic string executor eliminated | FAIL | api/db.js is unchanged. |
| Actual transaction callbacks restricted | FAIL | The new frozen facade is unit-tested; the existing callback plumbing remains unchanged. |
| New hostile native handler/write-family matrix | NOT VERIFIED | Not run in this increment. Mock-driver tests are not native evidence. |
| Full 425 database suite and credential database checks | NOT VERIFIED for this increment | Earlier retained results remain historical evidence; not relabelled current. |
| Schema contracts, strict startup, build, stock concurrency/retry | NOT VERIFIED for this increment | No current runs. |
| Authenticated browser/security and separate Consultant rendering | NOT VERIFIED for this increment | No browser started or application request made. |
| Three managed scans, source/history exposure and actual-server privacy canaries | NOT VERIFIED for this increment | No current scan or actual-server privacy clearance is claimed. |
| Disposable DB/browser resource cleanup | NOT APPLICABLE | This increment created no DB, server, browser, scheduler or worker. |
| Exact installable archive and owner clean-install command | BLOCKED / NOT PREPARED | Earlier architecture and runtime gates are not clear. |

## Implemented, isolated library

api/services/queryDescriptors.js supplies:

- One-time catalog installation; immutable fixed SQL chunks, stable IDs,
  declared operation and permitted execution contexts.
- Private WeakMap brands: strings, copied objects, inherited brands and forged
  JSON cannot become admitted descriptors.
- Typed finite identifier choices and bounded integer slots. Structural slots
  accept only branded fragments from the same family, not raw SQL or complete
  statements. Fragment-only plans cannot execute.
- Bound-value snapshots; accessor, prototype, proxy, function, cycle and
  non-finite-value rejection. Dates/binary data are copied and public snapshot
  tampering is detected before driver access.
- A frozen query-only transaction facade. It exposes no raw client, release,
  connection or plain-string COMMIT/ROLLBACK interface.
- Request/startup context separation and a one-way startup seal. There is no
  public environment-flag shortcut into isolated-tool execution.

This is a new capability library, **not proof that the existing application uses
it**. Branch/role authorization must remain in the existing actual staff/session
middleware and be verified again after migration.

## Source translator limitations and next implementation blockers

scripts/lib/sql-descriptor-compiler.mjs reads repository source only. It does not
connect, evaluate helpers, inspect configured environment values, run SQL files,
or execute generated modules. It preserves helper calls and argument evaluation
rather than constant-folding calls that may perform authorization or side effects.

compiler-coverage.json gives exact file/line/column and a structural reason for
every rejected construction. These include business-date/report predicates,
placeholder counters, SQL-array aliasing/spreads, controlled-stock expression maps,
SQL-file loading, metadata-derived identifiers, and nested producer/fragment
operations. The translator is experimental and requires further control-flow,
alias, callback, context and native-behavior review even for translated sites.
Candidate counts are **not** safe-site counts and do not reduce the retained 61.

The retained inventory uses NOT CLOSED rather than assigning any of the owner's
five final safe classifications prematurely. Proposed query identities do not
stand in for registered production identities. No test title/canary/SQL statement
or raw runner output is used as public delivery evidence: unit case names are
represented by SHA-256 IDs in saved unit results.

Required remaining work, already within the authorized scope:

1. Replace or formally constrain the rejected source constructions; establish
   complete alias/import/forwarder provenance and safe finite builder inputs.
2. Connect the descriptor-only admission path and restricted transaction facade
   to the actual executor and all runtime entry points, without breaking legitimate
   stock/profile/HR/Distributor/import/report/startup behavior.
3. Execute the native owned-database write/rollback/retry matrix and actual staff
   HTTP/browser/privacy flows, then all required regression/release gates.
4. Only after zero unresolved sites and passing gates, prepare exact installable
   release evidence and the owner-manual clean-install instructions. Do not run
   those instructions or publish.

## Reproducible commands

All commands below are offline source/pure-unit review; none is a release,
clean-install, migration, service-start or publication command.

    node scripts/security-query-architecture.mjs
    node scripts/security-descriptor-unit-check.mjs
    node scripts/security-descriptor-unit-check.mjs --descriptor-only
    node scripts/security-query-architecture-report.mjs

The unit wrapper uses a finite child-environment allowlist, excludes configured
application secrets, discards raw runner output and records a fresh run ID with
safe statuses and source hashes. The latest full-unit evidence is
${unit.evidence}. The earlier targeted runner initially failed to parse an escaped
test string; it was fixed before the passing runs. It is not counted as a pass.

## Changed files

${files.map(f=>'- '+f.file+' — '+f.sha256).join('\n')}

Existing tracked application/migration/lock files are unchanged by this increment.
The memory update preserves the durable rule that descriptor-library tests and
translator counts cannot establish legacy-executor closure.

## Retained evidence versus new evidence

Previous evidence remains in generated-artifacts/sql-security-final-closure/.
Its database, browser, build, scan and cleanup results have not been overwritten
or treated as newly observed. Current evidence is only the source-review results
and pure-unit runs listed above. No recovery/target-schema authority or production
readiness is inferred from them.

## Safety

${safety}
`;
await fs.writeFile(out+'/report.md',report);
console.log(JSON.stringify({status:'BLOCKED - DO NOT PUBLISH',unitPassed:unit.passed,
  rejectedConstructions:coverage.issues.length,retainedUnresolved:61,report:out+'/report.md'}));
