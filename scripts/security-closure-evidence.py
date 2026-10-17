"""Build a sanitized review package; never includes source or raw failure logs."""
from pathlib import Path
import json,hashlib,subprocess,datetime,re,os,zipfile,collections
root=Path.cwd()
out=root/'generated-artifacts/security-remediation-closure'
def read(name):return json.loads((out/name).read_text())
def save(name,data):(out/name).write_text(json.dumps(data,indent=2))
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
latest=read('browser-results.json')
if 'latestAdminRegression' in latest:
    latest=latest['latestAdminRegression']
prior=[]
for file in sorted(out.glob('browser-results-prior-*.json')):
    data=json.loads(file.read_text())
    prior.append({'file':file.name,'status':data.get('status','completed checkpoints'),
      'stoppedAt':data.get('stoppedAt'),'results':data.get('results',[])})
save('browser-results.json',{'overall':'PARTIAL','latestAdminRegression':latest,
  'priorAttempts':prior,'priorFailuresPreserved':True,
  'limitations':['Staff first-login flow observed before final stale-cookie fix; corrected reset/login flow retested afterward.',
    'Admin clipboard delivery and authorized GM browser reset not separately verified.',
    'No database helpers used in this closure browser pass; earlier unknown-target incident is not erased.']})
full=read('full-database-results.json')
credential=read('credential-database-results.json')
keys=['numTotalTests','numPassedTests','numFailedTests','numPendingTests','success']
failures=[]
for t in full.get('testResults',[]):
    count=sum(a.get('status')=='failed' for a in t.get('assertionResults',[]))
    if count:failures.append({'suite':Path(t['name']).name,'failedChecks':count})
save('database-test-summary.json',{'fullSuite':{k:full.get(k)for k in keys},
  'credentialSuite':{k:credential.get(k)for k in keys},'failedSuites':failures,
  'schemaSource':'new private initdb cluster; source migrations/static DDL with labelled synthetic foundations',
  'businessDatabaseAccess':False,'fullSuiteDisposition':'FAIL retained; missing legacy foundations prevent equivalence to original schema-clone evidence',
  'credentialSuiteDisposition':'PASS after explicit fixture-only users.additional_roles scaffolding',
  'noProductionSchemaInference':True})
fixtures=[]
for file in (out/'fixture-runs').glob('*.json'):
    if file.name.endswith('-cleanup.json'):continue
    owner=json.loads(file.read_text())
    cleanup_file=out/'fixture-runs'/(owner['database']+'-cleanup.json')
    fixtures.append({'database':owner['database'],'hostFingerprint':owner['hostFingerprint'],
      'processId':owner['processId'],'createdAt':owner['createdAt'],'cleanupOwner':owner['cleanupOwner'],
      'directoryAbsent':not Path(owner['clusterDirectory']).exists(),'cleanupRecordExists':cleanup_file.exists()})
save('fixture-cleanup-summary.json',{'recordedRuns':fixtures,
  'allRecordedClusterDirectoriesAbsent':all(f['directoryAbsent']for f in fixtures),
  'earlierAmbiguousCandidatesDeleted':0,'interruptedHistoricalFixtureCleanup':'NOT VERIFIED',
  'note':'One incomplete individual template-drop journal is superseded only by deletion of its exactly matched owned cluster; its original false marker is preserved.'})
save('interrupted-fixture.json',{'status':'INTERRUPTED FIXTURE CLEANUP: NOT VERIFIED',
  'priorAmbiguousCandidateCount':14,'databaseCatalogueQueried':False,'candidatesDeleted':0,
  'reason':'Earlier interrupted fixture has no uniquely attributable ownership journal. New run ownership cannot establish the identity of an older ambiguous database.'})
scan=json.loads((root/'generated-artifacts/security-remediation/exposure-candidates.json').read_text())
save('exposure-summary.json',{'filesScanned':scan['trackedFiles'],
  'reachableBlobsScanned':scan['reachableBlobsScanned'],
  'currentClassifications':dict(collections.Counter(x['classification']for x in scan['current'])),
  'historicalCandidates':len(scan['historical']),'valuesIncluded':False,
  'limitation':'Heuristic source patterns only; retained history still contains exposures; no history rewrite.'})
triage=read('scanner-triage.json')
unresolved=[r for r in triage if r['classification']=='unresolved']
blockers="""# Remaining blockers

- **Clean install: NOT VERIFIED.** Permitted managed package tooling cannot perform an isolated lockfile-only install. No shell-install bypass or dependency change was made; the existing-dependency build is not substituted.
- **Complete isolated database suite: FAIL.** 185/378 passed, 43 failed, 150 pending/skipped in the source-only schema fixture. Missing legacy objects include online_orders, branch_distributor_profit and stock_linked_reversals; some legacy columns/constraints are absent. These are not evidence of a deployed regression, nor a clean fresh-install certification. No shared schema was read to fill the gap.
- **Reachable generic SQL executor: unresolved CRITICAL.** api/db.js query(text,params) at the reported sink needs complete caller-taint review. Static binding evidence for other flagged statements does not prove the generic sink safe.
- **Interrupted historical fixture cleanup: NOT VERIFIED.** The 14 ambiguous prior database candidates were preserved without catalogue queries or deletion.
- **Secret-output verification: PARTIAL.** Synthetic checks cover captured fixture logs, selected HTTP/error responses and current bundle files. Every error path, report generator, source-map canary and independently built deployment artifact is not proven.
- **Production preflight/recovery/schema compatibility: NOT VERIFIED and outside this authorization.** No production mutation, credential rotation, session invalidation, operational restart or publication is authorized by this work.
- **Remaining browser detail:** Admin clipboard/private-delivery behavior and authorized GM reset were not separately browser-tested. Prior phase's three unknown-target read-only helper calls remain an unresolved historical isolation incident, not newly observed production access.
"""
(out/'remaining-blockers.md').write_text(blockers)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
changed=sorted(set(changed+[p for p in new if p.startswith(('api/','tests/','scripts/','.agents/'))]))
manifest={'recordedAtUtc':now,'requestedStartingHead':'c8ed35e929559447963442627906090ebd55ecd2',
  'actualRetainedHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
  'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),
  'workingTreeCandidate':True,'dependenciesChanged':False,
  'lockfileSha256':hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest(),
  'files':{p:hashlib.sha256((root/p).read_bytes()).hexdigest()for p in changed if(root/p).is_file()}}
assert manifest['lockfileSha256']==read('clean-install.json')['copyLockfileSha256']
save('candidate-manifest.json',manifest)
(out/'changed-files.md').write_text('# Changes in this closure phase\n\n'+
  'Earlier retained repairs are committed in the preserved HEAD; this list contains new working-tree changes only. Raw diffs are intentionally excluded.\n\n'+
  ''.join('- `'+p+'`\n'for p in changed))
unit=(out/'unit-tests-final.log').read_text()
unit_count=re.search(r'Tests\s+(\d+) passed',unit).group(1)
report=f"""# PARTIALLY VERIFIED - DO NOT PUBLISH

Recorded: {now}

## Scope and candidate

Branch: security/emergency-startup-remediation-20261017. Requested starting HEAD c8ed35e929559447963442627906090ebd55ecd2 was already followed by retained HEAD {manifest['actualRetainedHead']} when this phase began. No reset, history rewrite or user-change removal occurred. Attachment files were preserved. No dependencies or lockfile changed.

## Implemented fixes and exact source

- api/services/startupPolicy.js#createStartupPolicy now requires every TASKS worker flag explicitly false in production, including absence/malformed/enabled rejection. Unit profile fixtures and the existing 23-check startup contract were aligned. No production values were changed.
- server.js public static boundary now refuses dot-paths, environment-file suffixes and source maps before build/root static serving. Existing source/script/report denials remain. Red/white UI and business navigation were preserved.
- server.js API session middleware + api/services/sessionPolicy.js#isFreshCredentialLogin fix a browser-reproduced defect: after reset revoked the old cookie, valid new credentials were rejected before login. Only exact credential POST handlers can authenticate afresh; every business route still validates session version/current account scope. tests/session-policy.unit.test.js locks down exact methods/paths.
- api/auth/me.js and the server auth catch no longer print raw validation errors.
- scripts/run-isolated-stock-audit.mjs journals database identity, sanitized host fingerprint, PID/time/cleanup owner before each database CREATE; direct Node Vitest invocation avoids the npx wrapper's missing XDG_CONFIG_HOME requirement in a minimal environment.
- scripts/security-closure-fixture.mjs creates a new PostgreSQL cluster under a uniquely recorded owned temporary directory. No configured DATABASE_URL, notebook helper, business schema clone, production record or real credential is read. Candidate migrations/static DDL populate only this fixture. Missing legacy foundations are explicitly scaffolded, never called production-compatible migrations.
- scripts/security-closure-browser.mjs uses real Chromium, staff UI and session middleware; secrets travel only in process memory/IPC. No credential file, cookie/token/request-body log, browser trace or exposed secret value is included.
- scripts/security-closure-owned-cleanup.py removes only a positively journalled cluster after matching directory/port fingerprint and process/transport evidence. The 14 older ambiguous databases remain untouched.

## Verification results

| Check | Result | Evidence |
|---|---|---|
| Full unit suite | PASS {unit_count}/{unit_count}, 59 files | unit-tests-final.log |
| Existing 23 startup contracts | PASS 23/23 | startup-contract-final.log |
| Production-mode build | PASS with existing dependencies only | build.log; no clean-install inference |
| Complete isolated DB suite | FAIL: 185 passed / 43 failed / 150 pending, total 378 | database-test-summary.json; missing legacy fixture objects/constraints, not repaired by touching shared schema |
| Credential-specific DB suite | PASS 9/9 | database-test-summary.json; schema fixture explicitly adds legacy additional_roles |
| Staff first-login browser | PASS observed before final middleware fix | prior staged evidence in browser-results.json; temporary login 200, restricted access 403, password-change POST 200 no-store, automatic sign-out 401, old credential 401, permanent login/me reload 200 |
| Browser role/branch enforcement | PASS | consultant/townshop loaded, assigned history 200, other-branch history 403; exact-ID anonymous reset 401 and consultant reset 403 |
| Rendered Admin reset regression | PASS after fix | browser-results.json: both reset POSTs 200, affected session 401, other/admin sessions 200, new reset credential login 200 with stale cookie, replay 401 |
| Source/script/report/dotfile/map HTTP probes | PASS for sampled requests | previous staged browser results and static boundary review; no real source-map canary was created |
| Strict-launcher rehearsal | PASS on owned schema fixture | startup-rehearsal.json, /api/health 200; all scheduler/worker flags false |
| Clean dependency install | NOT VERIFIED | clean-install.json; disposable source copy hash matched and copy removed, no existing node_modules copied |
| Current credential-pattern scan | PASS heuristic scope | exposure-summary.json; {scan['trackedFiles']} files, zero unresolved current-source patterns; retained history exposures remain |
| Managed scans | Reviewed, NOT clean verdict | scanner-summary.json and scanner-triage.md: every returned finding classified; {len(unresolved)} unresolved location remains |
| Synthetic output safety | PARTIAL | secret-output-verification.json and secret-log-check.json; no configured secrets retrieved; finite routes/logs/current bundles only |
| This pass's recorded fixture cleanup | PASS directory/ownership reconciliation | fixture-cleanup-summary.json, fixture-runs/*-cleanup.json, owned-residual-cleanup.json |
| Older interrupted fixture | NOT VERIFIED | interrupted-fixture.json; 14 ambiguous candidates preserved |
| Production recovery/schema/rotation/publication | NOT VERIFIED / not performed | outside authorization |

## Failure evidence retained and limits

Browser attempt failures are retained, not overwritten as passes. Initial form navigation and Admin action-selector races were harness issues. The later reset-credential 401 was a real stale-cookie middleware defect and was fixed/retested. Rendered Admin reset screenshots contain masked inputs only; no copy-to-clipboard evidence is claimed.

The fresh source-only schema revealed missing legacy CREATE definitions for branches and branch_activity_transactions, plus users.additional_roles. Explicit synthetic scaffolding was needed to exercise authentication. Broader missing schema prevented the full suite from being green. This does not authorize reconstructing production schema or changing historical data to satisfy tests.

Concurrent runs also exposed a shared-evidence hazard: a successful cleanup file from another process could not prove a first browser run cleaned up. Per-run journals were reconciled. One positively owned residual directory was removed only after exact recorded transport/PID evidence. One individual template cleanup marker remains false in its raw journal; matching whole-cluster directory deletion is separately recorded, not silently rewritten into a database-drop pass. Older ambiguous databases were not investigated through a catalogue.

The earlier phase's three unbound-helper reads cannot be assigned a target retrospectively. This pass made no such helper calls, but does not erase that historical incident or claim it has been resolved.

## Scanner reasoning

scanner-triage.md contains sanitized file, line, rule, classification and code-level reasoning for every finding. Static literal/bound query flags, fixed-error Object.assign calls, operator-only filesystem tools and non-secret catalogue ID hashing are distinguished from the unresolved generic executor. No suppression or dependency upgrade was applied. Both xlsx advisories describe fixed CDN versions (0.19.3 / 0.20.2), while installed/pinned official CDN version is 0.20.3 and scanner affected ranges are unbounded; this specific version mismatch is documented, not a blanket spreadsheet risk acceptance. Privacy scanner returned zero findings; that is not proof of universal safety.

## Independent review commands

```sh
npm test
NODE_ENV=production npm run build
PREDEPLOY_TARGET_ROOT="$PWD" node --test scripts/predeployment-startup-contract.test.mjs
python scripts/audit-credential-exposure.py
node scripts/security-closure-fixture.mjs --database-suites
node scripts/security-closure-fixture.mjs --credential-only
node scripts/security-closure-fixture.mjs
node scripts/security-closure-fixture.mjs --admin-only
node scripts/security-closure-triage.mjs
python scripts/security-closure-source-copy.py
```

Only execute fixture commands in a non-production local environment. They create owned PostgreSQL resources. Do not run concurrent fixtures against shared top-level evidence files; retain and reconcile exact per-run journals. Do not run legacy repair tools, shared/default DB helpers or any production command.

## Controlled next gates and rollback

Publication remains forbidden. See remaining-blockers.md. Earlier password-rotation-runbook.md and controlled-release-plan.md are retained as PREPARED, NOT EXECUTED. There is no new production migration in this phase.

Recover only to a reviewed safe candidate retaining credential removal and strict startup; never restore exposed credentials/default seeders or the old unguarded launcher. Production target/schema compatibility, recoverable backup and scoped credential/session rotation require separately authorized preflight. Do not alter live users, stock, sessions, startup settings or workers to make this evidence green.

Production database modified: NO  
Production passwords rotated: NO  
Production sessions invalidated: NO  
Production environment modified: NO  
Production restarted: NO  
Production scheduler stopped: NO  
Production worker activated: NO  
Production published: NO
"""
(out/'report.md').write_text(report)
required=['report.md','candidate-manifest.json','clean-install.json','browser-results.json',
  'browser-cleanup.json','fixture-ownership.json','scanner-triage.md','scanner-summary.json',
  'secret-output-verification.json','startup-rehearsal.json','database-test-summary.json',
  'changed-files.md','remaining-blockers.md']
extras=['fixture-cleanup-summary.json','interrupted-fixture.json','exposure-summary.json',
  'owned-residual-cleanup.json','secret-log-check.json','admin-reset-complete.png','consultant-reloaded.png']
assert all((out/f).exists() for f in required)
with zipfile.ZipFile(out/'security-remediation-closure-review.zip','w',zipfile.ZIP_DEFLATED)as z:
    for f in required+extras:
        if(out/f).exists():z.write(out/f,arcname=f)
print('Review bundle ready. All required evidence files present; status PARTIALLY VERIFIED.')
