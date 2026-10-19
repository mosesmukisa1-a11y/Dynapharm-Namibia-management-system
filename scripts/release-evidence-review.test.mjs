import {syntheticCredential, syntheticCredentialUrl} from './lib/synthetic-credential-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isReviewSource, compareSourceEvidence, recoveryReplyAssertions, offlineAuditOutput, isDeploymentSchemaSource,
  reviewRecoverySourceReply, offlineReleaseVerdict} from './lib/release-evidence-review.mjs';
const hash = 'a'.repeat(64), other = 'b'.repeat(64);
for (const file of ['api/db.js', 'scripts/lib/backup-dump-watchdog.py', 'docs/plan.md', '.replit', 'package-lock.json'])
  test(`source allowlist accepts ${file}`, () => assert(isReviewSource(file)));
for (const file of ['../.env', '/etc/passwd', 'api/../.env', 'api//db.js',
  'api\\db.js', '.env', 'api/.env.production', 'uploads/secret.json',
  'generated-artifacts/report.json', 'node_modules/pg/index.js', 'credentials/key.json',
  'reports_data.json', 'public/uploads/object.json', 'api/credentials/value.json',
  'api/service-account.json', 'api/credentials.json', 'scripts/runtime-data.json'])
  test(`unsafe/runtime path excluded ${file}`, () => assert.equal(isReviewSource(file), false));
test('exact source match cannot prove archive, clean install or production', () => {
  const r = compareSourceEvidence({'api/db.js': hash}, {'api/db.js': hash});
  assert.equal(r.status, 'IDENTICAL_SOURCE_ONLY');
  assert.equal(r.provesArchiveOrCleanInstall, false);
  assert.equal(r.provesProduction, false);
});
test('changed, missing and added source invalidates exact-candidate evidence', () => {
  const r = compareSourceEvidence({'api/db.js': hash, 'src/a.js': hash},
    {'api/db.js': other, 'scripts/new.mjs': hash});
  assert.equal(r.status, 'NOT_EXACT_CANDIDATE_EVIDENCE');
  assert.deepEqual(r.changed, ['api/db.js']);
  assert.deepEqual(r.missing, ['src/a.js']);
  assert.deepEqual(r.added, ['scripts/new.mjs']);
});
test('empty or malformed evidence cannot pass', () => {
  assert.notEqual(compareSourceEvidence({}, {}).status, 'IDENTICAL_SOURCE_ONLY');
  assert.throws(() => compareSourceEvidence({'../private': hash}, {}), /INVALID_SOURCE_REFERENCE/);
  assert.throws(() => compareSourceEvidence({'api/db.js': 'private-value'}, {}), /INVALID_SOURCE_REFERENCE/);
});
function reply() {
  return {...Object.fromEntries(recoveryReplyAssertions.map(key => [key, true])),
    productionResourceRef: 'synthetic-primary', recoveryResourceRef: 'synthetic-replica',
    providerAttestationRef: 'synthetic-support-reference', engineMajor: 16,
    observedAtUtc: '2026-10-19T10:00:00Z', validUntilUtc: '2026-10-19T11:00:00Z',
    changesPerformed: false};
}
const now = Date.parse('2026-10-19T10:30:00Z');
test('complete reply is information only, never permission or established binding', () => {
  const r = reviewRecoverySourceReply(reply(), now);
  assert.equal(r.status, 'INFORMATION_COMPLETE_FOR_OFFLINE_PLAN_REVIEW');
  assert.equal(r.productionExecutionAllowed, false);
  assert.equal(r.sourceBindingEstablished, false);
});
for (const field of recoveryReplyAssertions)
  test(`missing provider assertion blocks: ${field}`, () => {
    const r = reviewRecoverySourceReply({...reply(), [field]: false}, now);
    assert(r.missing.includes(field));
    assert.equal(r.status, 'INFORMATION_INCOMPLETE');
  });
test('expired/future evidence, same resource and private URL cannot pass or leak', () => {
  for (const update of [
    {validUntilUtc: '2026-10-19T10:01:00Z'}, {observedAtUtc: '2026-10-19T10:31:00Z'},
    {recoveryResourceRef: 'synthetic-primary'},
    {providerAttestationRef: syntheticCredentialUrl({local: false})},
    {changesPerformed: true}, {engineMajor: null}
  ]) {
    const r = reviewRecoverySourceReply({...reply(), ...update}, now);
    assert.equal(r.status, 'INFORMATION_INCOMPLETE');
    assert(!JSON.stringify(r).includes('DO_NOT_EMIT'));
    assert(!JSON.stringify(r).includes(syntheticCredential('uri')));
    assert(!JSON.stringify(r).includes(syntheticCredentialUrl()));
  }
});
test('offline success cannot close B1-B4; B5 acceptance does not reopen or imply live escalation', () => {
  const r = offlineReleaseVerdict({b5Closed: true, allOfflineTestsPassed: true, providerReply: reply()});
  assert.equal(r.verdict, 'BLOCKED - DO NOT PUBLISH');
  assert.equal(r.productionExecutionAllowed, false);
  assert.equal(r.blockers.B5, 'CLOSED_OWNER_ATTESTED_EXISTING_EVIDENCE');
  for (const key of ['B1','B2','B3','B4','C1']) assert(!r.blockers[key].startsWith('CLOSED'));
});
test('native recovery replaces unavailable direct replica without enabling custom adapter', () => {
  const r = offlineReleaseVerdict({b5Closed: true});
  assert.equal(r.recoveryPlan.selectedPath, 'REPLIT_NATIVE_PITR_AND_SCHEDULED_BACKUPS');
  assert.equal(r.recoveryPlan.directReplicaRequiredForNativePath, false);
  assert.equal(r.recoveryPlan.customAdapterDisposition,
    'DISABLED_SOURCE_BINDING_UNVERIFIED_GUARDS_UNCHANGED');
  assert.equal(r.productionExecutionAllowed, false);
});
test('native capability and development checkpoints cannot prove production or object recovery', () => {
  const r = offlineReleaseVerdict({nativePitrEnabled: true, scheduledBackups: true,
    developmentCheckpoint: true, allOfflineTestsPassed: true});
  assert.equal(r.recoveryPlan.nativeTargetRecoveryEvidence, 'REQUIRED_NOT_ESTABLISHED_BY_CAPABILITY');
  assert.equal(r.recoveryPlan.databaseRecoveryIncludesAppStorage, false);
  assert.equal(r.recoveryPlan.developmentCheckpointProvesProductionRecovery, false);
  assert.equal(r.verdict, 'BLOCKED - DO NOT PUBLISH');
  assert.equal(r.productionExecutionAllowed, false);
});
test('audit output is narrow and cannot overwrite arbitrary evidence/files', () => {
  assert.equal(offlineAuditOutput(['--output-dir=generated-artifacts/release-offline-readiness/sql-boundary']),
    'generated-artifacts/release-offline-readiness/sql-boundary');
  assert.equal(offlineAuditOutput([]), 'generated-artifacts/sql-runtime-enforcement-final');
  for (const args of [['--output-dir=/tmp/arbitrary'], ['--output-dir=generated-artifacts/a/../a'],
    ['--output-dir=generated-artifacts/a/b', '--extra'], ['--execute'], [null]]) {
    assert.throws(() => offlineAuditOutput(args), /INVALID_OFFLINE_AUDIT_OUTPUT/);
  }
});
test('deployment schema comparison includes actual migration/bootstrap sources', () => {
  for (const file of ['api/migrations/additive.sql', 'migrations/additive.sql', 'api/schema/users.js', 'server.js'])
    assert(isDeploymentSchemaSource(file));
});
test('synthetic restore validation schema is not a production database migration', () => {
  assert.equal(isDeploymentSchemaSource('scripts/lib/synthetic-restore-schema.mjs'), false);
  assert.equal(isDeploymentSchemaSource('docs/schema-review.md'), false);
});
