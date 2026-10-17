// Sanitized stage summary. No SQL/request bodies, raw logs, credentials or source
// archives enter the review ZIP.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const out='generated-artifacts/security-remediation-final';
await fs.mkdir(out,{recursive:true});
const load=async(file,fallback={})=>{try{return JSON.parse(await fs.readFile(out+'/'+file,'utf8'));}catch{return fallback;}};
const write=(file,data)=>fs.writeFile(out+'/'+file,JSON.stringify(data,null,2));
const provenance=await load('schema-provenance.json'),calls=await load('sql-caller-inventory.json');
const unit=await fs.readFile(out+'/unit-tests.log','utf8');
const startup=await fs.readFile(out+'/startup-contract.log','utf8');
const tests=Number(unit.match(/Tests\s+(\d+) passed/)?.[1]||0);
const contracts=Number(startup.match(/# pass (\d+)/)?.[1]||0);
await write('test-summary.json',{unit:{passed:tests,status:tests?'PASS':'NOT VERIFIED'},
  startupContracts:{passed:contracts,status:contracts===23?'PASS':'FAIL'},
  fullDatabase:{status:'BLOCKED',freshChecksRun:0,expectedChecks:378,
    reason:'Canonical repository foundation missing; refused before provisioning',
    priorPhase:{passed:185,failed:43,pending:150,total:378,reusedAsCurrentPass:false}},
  credentialDatabase:{status:'BLOCKED',freshChecksRun:0,priorPhasePassed:9,reusedAsCurrentPass:false}});
await write('browser-results.json',{status:'BLOCKED',browserLaunched:false,databaseProvisioned:false,
  reason:'Repository lacks authoritative users.additional_roles and other canonical foundations; guessed test scaffolding is forbidden.',
  checks:['authorized GM reset','Admin private clipboard','affected-session invalidation',
    'unrelated-session continuity','reset-token replay','staff-browser source/map denial']
    .map(name=>({name,status:'NOT VERIFIED in this phase'})),
  previousEvidencePreserved:true});
await write('historical-fixture.json',{status:'Historical fixture cleanup remains NOT VERIFIED; zero ambiguous databases deleted.',
  catalogueQueried:false,ambiguousDatabasesDeleted:0});
const scans=await load('scanner-summary.json',[]);
await write('sql-review-summary.json',{callerLocations:calls.inventory?.length||0,
  unresolved:calls.inventory?.filter(c=>c.classification==='UNRESOLVED').length||0,
  parseFailures:calls.parseFailures?.length||0,genericExecutorResolved:false,
  completeness:'Conservative syntax inventory; not complete interprocedural caller/alias/taint certification',
  fixedDefect:'findAll previously interpolated unchecked orderBy; now bounded identifiers/directions, values bound.',
  hostileStructureTests:'unit and actual dedicated PostgreSQL probe',
  suppressionAdded:false});
const changed=execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const added=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'})
  .split('\0').filter(p=>/^(api|scripts|tests)\//.test(p));
await fs.writeFile(out+'/changed-files.md','# Working-tree changes\n\n'+
  [...new Set([...changed,...added])].sort().map(p=>'- '+p+'\n').join('')+
  '\nPrior committed fixes, evidence, navigation, clinical/history identities and user attachments were retained. No raw deletion diff is shared.\n');
const blockers=`# Remaining release blockers

1. Canonical schema definitions missing: ${provenance.blocked?.join(', ')}. Full types, defaults, keys, constraints, enum/check rules and compatibility cannot be inferred from runtime field lists. The prior handcrafted scaffold was removed. No production schema inspected.
2. Full 378-check database suite and credential-specific suite cannot run under the requested repository-only foundation. They now fail closed before provisioning, not pass/skip under fabricated tables.
3. Generic query executor remains unresolved: ${calls.inventory?.filter(c=>c.classification==='UNRESOLVED').length||0} dynamic syntax locations remain, and reflective/first-class call propagation is not certified. The inventory is reviewable but is not a full taint proof.
4. Clean installation has not been executed by Agent. The exact manual owner command is prepared; no PASS until its sanitized output is captured. No workspace node_modules will be copied/reused as proof.
5. GM reset, Admin clipboard and other fresh staff-browser checks are BLOCKED by canonical schema, not substituted with mocks or previous browser results.
6. Synthetic source-map/source-file HTTP component checks do not prove every full-application startup/log/error path. Full application evidence remains blocked/partial.

Historical fixture cleanup remains NOT VERIFIED; zero ambiguous databases deleted.

No release or production authority is granted by this evidence. Production preflight, migration, rotation, service actions, workers and publication remain forbidden.
`;
await fs.writeFile(out+'/remaining-blockers.md',blockers);
const output=await load('secret-output-verification.json');
const sql=await load('sql-attack-results.json');
const fixtures=[];let ownershipReadError=false;try{for(const d of await fs.readdir(out+'/fixtures')){
  const ownership=JSON.parse(await fs.readFile(out+'/fixtures/'+d+'/ownership.json','utf8'));
  const cleanup=JSON.parse(await fs.readFile(out+'/fixtures/'+d+'/cleanup.json','utf8'));
  fixtures.push({database:ownership.database,cleanupOwner:ownership.cleanupOwner,processId:ownership.processId,
    hostFingerprint:ownership.hostFingerprint,createdAt:ownership.createdAt,
    directoryAbsent:await fs.stat(ownership.directory).then(()=>false,()=>true),cleanupVerified:cleanup.cleanupVerified});
}}catch{ownershipReadError=true;}
await write('fixture-cleanup-summary.json',{fixtures,ownershipReadError,
  allRecordedDirectoriesAbsent:!ownershipReadError&&fixtures.length>0&&fixtures.every(f=>f.directoryAbsent),
  fullApplicationDatabaseCreated:false,historicalAmbiguousDatabasesDeleted:0});
const when=new Date().toISOString();
const report=`# BLOCKED - DO NOT PUBLISH

Recorded ${when}. Branch security/emergency-startup-remediation-20261017; retained HEAD ${execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}. No reset/rewrite/removal of prior evidence or user changes.

## A. Canonical repository schema — BLOCKED

schema-provenance.json and schema-provenance.md list static definitions and provenance per required object. backend/create_delivery_tables.sql is the repository source for online_orders, including branch/town foreign keys, indexes and declared defaults. Its comment-only allowed-value lists are not CHECK/enum constraints. api/services/linkedReversals.js#reversalSchema defines stock_linked_reversals; its schema batch depends on branch_distributor_profit. Neither may be replaced by an arbitrary simplified table.

No authoritative current repository definitions were found for ${provenance.blocked?.join(', ')}. A metadata-only Git history search found those CREATE/ADD definitions only in the earlier security-closure fixture, not an authoritative migration. The search command and path-only output are retained; no historical secret-bearing source/diff was printed.

scripts/security-final-schema-guard.mjs blocks before provisioning when these foundations are absent. scripts/security-closure-fixture.mjs no longer invents branches/BAT/users.additional_roles. The delivery SQL source was registered for fixture construction, but it cannot safely execute before its canonical dependencies are restored/reviewed. This phase applies no migrations.

No current 378/378 pass is claimed. Prior phase's 185 passed / 43 failed / 150 skipped remains historical evidence. test-summary.json distinguishes that result from fresh BLOCKED stages. Source definitions, including full column types, indexes, foreign keys, constraints and enum/check rules, must be supplied from an authoritative repository/provisioning source without inspecting production. Additional legacy mismatches may remain after those definitions are supplied.

## B. Generic SQL executor — BLOCKED, one concrete defect repaired

scripts/security-final-inventory.mjs generated ${calls.inventory?.length||0} conservative call-site records with file, line, function, method, argument form and reasoning. Static imports, namespace calls, destructured dynamic imports, local DB wrappers and transaction/pool sinks are included. Coverage limits and first-class escapes are explicit; reflection/alias/reexport propagation is not certified.

${calls.inventory?.filter(c=>c.classification==='UNRESOLVED').length||0} locations are unresolved. Therefore api/db.js#query is NOT classified resolved and no scanner rule is suppressed.

Repaired api/db.js#findAll unchecked orderBy interpolation using api/services/sqlShape.js#orderByClause. Only bounded bare identifiers and ASC/DESC are accepted; expressions, operators, comments, clauses and malformed identifiers are rejected. insert() now uses the same reviewed insertStatement builder. Error messages do not echo hostile input. No production data/API query was executed.

tests/sql-shape.unit.test.js proves hostile values leave SQL text unchanged and structural payloads are refused. scripts/security-final-sql-rehearsal.mjs verified the real builders against an independently owned disposable PostgreSQL cluster: status ${sql.status||'NOT VERIFIED'}. Its sentinel table is a purpose-specific security probe, NOT canonical lifecycle scaffolding or a 378-test substitute. Ownership was recorded before initdb/CREATE; cleanup is separately verified.

## C. Exact-candidate clean installation — NOT VERIFIED

candidate-manifest.json and exact-candidate-source.tar contain the final candidate source/lockfile hashes. The archive excludes Git, dependencies, generated artifacts, attachments, environment files, backend captured data, runtime reports, spreadsheets/CSV and private key files. It is not included in the public review ZIP.

Agent's permitted package interface cannot perform isolated lockfile-only installation. No shell-install bypass, dependency update, workspace node_modules reuse or workflow restart occurred.

Moses can run exactly this command block from the Replit shell:

\`\`\`sh
cd /home/runner/workspace
node scripts/security-final-clean-gate.mjs --owner-manual
\`\`\`

The command validates the archived source against the manifest/current source, extracts to a new temporary directory without node_modules, runs npm ci in a minimal environment, then attempts production build, unit suite, full isolated suite, credential suite, 23 contracts and strict launcher/browser rehearsal. It records lock/source hashes before/after, stage exit statuses and cleanup, without printing raw install/test logs or inheriting configured secrets. The known schema guard will block database/application stages until authoritative foundations are restored. No PASS is reported before the manual output exists. Inspect clean-install.json afterward; do not publish even if install itself passes.

## D. Remaining staff-browser checks — BLOCKED, not performed

browser-results.json lists authorized GM reset, Admin clipboard, session invalidation/continuity, reset-token replay and staff-browser route checks individually as NOT VERIFIED in this phase. A real staff target cannot be created without the prohibited guessed schema. No tester, notebook DB helper, real account, shared schema, clinical record or production data was used to bypass this gate. Earlier browser results remain in prior evidence and are not silently promoted to new verification.

## E. Synthetic output verification — PARTIAL

scripts/security-final-output-rehearsal.mjs uses the actual api/services/publicAssetPolicy.js boundary on a new loopback-only component server, with real harmless files at source/report/dotfile paths and a real .map canary. All denied requests are recorded with file existence and response status. The canary and server are removed afterward. This is HTTP component evidence, not full app/staff workflow evidence.

The actual production build ran using existing dependencies and a server-only random synthetic marker in a minimal environment. Captured build output, bundles/artifacts and then-existing reports were compared in memory; no marker value was recorded. Current source maps are counted; the harmless map canary is separately tested. Build exit status: ${output.build?.exitCode??'NOT VERIFIED'}; map canary denial: ${output.realSourceMapCanaryDenied??'NOT VERIFIED'}.

Full application startup/application logs and authenticated error responses remain BLOCKED/NOT VERIFIED across every handler. No real configured secret was retrieved for comparison.

## Verification summary

- Unit suite: ${tests} passed.
- Startup contracts: ${contracts}/23 passed.
- Purpose-specific real PostgreSQL SQL-structure probe: ${sql.status||'NOT VERIFIED'}.
- Production build: ${output.build?.exitCode===0?'PASS with existing dependencies only':'NOT VERIFIED'}.
- Complete database suite / credential-specific suite / strict full-app launcher / browser workflow: BLOCKED before provisioning.
- Clean-install gate: NOT VERIFIED, manual command prepared.
- Managed scans: fresh results in scanner-summary.json; generic executor and unresolved caller paths remain release blockers.
- Credential exposure scan: current-phase sanitized evidence retained; historical exposures are not revoked by source removal.
- Current owned fixture cleanup: see fixture-cleanup-summary.json and per-run ownership/cleanup records.
- Historical fixture cleanup remains NOT VERIFIED; zero ambiguous databases deleted.

## Independent commands and retained safeguards

\`\`\`sh
node scripts/security-final-inventory.mjs
npm test
PREDEPLOY_TARGET_ROOT="$PWD" node --test scripts/predeployment-startup-contract.test.mjs
node scripts/security-final-sql-rehearsal.mjs
node scripts/security-final-output-rehearsal.mjs
node scripts/security-closure-fixture.mjs --database-suites
node scripts/security-closure-fixture.mjs --credential-only
python scripts/audit-credential-exposure.py
\`\`\`

Use only non-production local execution. Foundation-dependent commands intentionally fail closed. A source-map component pass is not a workflow pass; the dedicated probe table is not a canonical schema definition. All scheduler/worker safety flags and the strict launcher are retained; no production service/environment changed. Changed-file list and exact candidate/lockfile hashes are reviewable. Earlier controlled release/rollback runbooks remain PREPARED, NOT EXECUTED. Never roll back to exposed credentials or default seeders.

Production database modified: NO  
Production passwords rotated: NO  
Production sessions invalidated: NO  
Production environment modified: NO  
Production restarted: NO  
Production scheduler stopped: NO  
Production worker activated: NO  
Production published: NO
`;
await fs.writeFile(out+'/report.md',report);
console.log('Sanitized final evidence report written; BLOCKED - DO NOT PUBLISH.');
