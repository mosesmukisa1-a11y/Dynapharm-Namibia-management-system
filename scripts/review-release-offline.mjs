// Source/evidence filesystem only. No application, driver, SDK, HTTP or secret imports.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isReviewSource, compareSourceEvidence, offlineReleaseVerdict, isDeploymentSchemaSource} from './lib/release-evidence-review.mjs';
import {writeReviewJson} from './lib/offline-review-files.mjs';
const base = 'generated-artifacts/release-offline-readiness';
const baselinePath = 'generated-artifacts/upload-storage-hardening/candidate-manifest.json';
const b5Path = 'generated-artifacts/consolidated-security-release-review/b5-acknowledgement-evidence.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function readRegular(file) {
  let checked = '';
  for (const segment of file.split('/')) {
    checked = checked ? `${checked}/${segment}` : segment;
    const stat = await fs.lstat(checked);
    if (stat.isSymbolicLink()) throw Error('SOURCE_SYMLINK_REFUSED');
  }
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw Error('SOURCE_NOT_REGULAR');
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function readJson(file) { return JSON.parse(await readRegular(file)); }
async function main() {
  if (process.argv.slice(2).join(' ') !== '--review') throw Error('OFFLINE_REVIEW_FLAG_REQUIRED');
  const baseline = await readJson(baselinePath);
  if (baseline.archiveSha256 !== 'efd2ea29c43c8ef4b73aba24f7663de259e6a0b0b3693e5d276703f342c0dd74')
    throw Error('BASELINE_MANIFEST_MISMATCH');
  const retainedArchive = 'generated-artifacts/upload-storage-hardening/exact-candidate-source.tar';
  if (sha(await readRegular(retainedArchive)) !== baseline.archiveSha256)
    throw Error('BASELINE_ARCHIVE_MISMATCH');
  const env = {PATH: process.env.PATH, GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'};
  const list = execFileSync('git', ['-c', 'core.fsmonitor=false', 'ls-files',
    '--cached', '--others', '--exclude-standard', '-z'], {env, encoding: 'utf8', stdio: ['ignore','pipe','pipe']});
  const current = {};
  for (const file of [...new Set(list.split('\0').filter(isReviewSource))].sort()) {
    try { current[file] = sha(await readRegular(file)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const prior = Object.fromEntries(Object.entries(baseline.files).filter(([file]) => isReviewSource(file)));
  const comparison = compareSourceEvidence(prior, current);
  const evidencePaths = [
    baselinePath, 'generated-artifacts/upload-storage-hardening/release-gates.json',
    'generated-artifacts/upload-storage-hardening/scan-source-review.json',
    'generated-artifacts/consolidated-security-release-review/report.md',
    b5Path, 'generated-artifacts/b2-bounded-logical-backup/native-results.json',
    'generated-artifacts/b2-bounded-logical-backup/report.md',
    'generated-artifacts/b2-authorized-recovery-checks/report.md',
    'generated-artifacts/b2-storage-route-fingerprint-protocol/report.md'
  ];
  const evidenceReferences = [];
  for (const file of evidencePaths) evidenceReferences.push({file, sha256: sha(await readRegular(file)),
    classification: 'RETAINED_SUPPORT_ONLY_NOT_REEXECUTED'});
  const b5 = await readJson(b5Path);
  const b5Closed = b5.disposition === 'CLOSED' && b5.providerAcceptance.status === 'ACCEPTED' &&
    b5.providerAcceptance.sendAttempts === 1 && b5.inboxDelivery.status === 'OWNER_ATTESTED_DELIVERED' &&
    b5.humanAcknowledgements.length === 2 && b5.humanAcknowledgements.every(a =>
      a.policyAcceptance.roleAccepted === true && a.policyAcceptance.primaryAcknowledgementWindowHours === 1 &&
      a.policyAcceptance.escalationAfterOriginalAlertHours === 2) &&
    b5.duplicateSuppression.status === 'PREVIOUSLY_VERIFIED' && b5.escalation.provesLiveDelivery === false;
  if (!b5Closed) throw Error('B5_RETAINED_EVIDENCE_MISMATCH');
  const triage = await readJson('generated-artifacts/upload-storage-hardening/scan-source-review.json');
  const findings = triage.sast.map(row => ({file: row.path,
    sourceMatches: current[row.path] === row.sourceSha256}));
  const untouched = prefix => ![...comparison.changed,...comparison.added,...comparison.missing].some(p => prefix(p));
  const result = {recordedAtUtc: new Date().toISOString(), ...offlineReleaseVerdict({b5Closed}),
    reviewScope: 'SOURCE_TEXT_ONLY_NOT_INSTALLABLE_ARCHIVE',
    sourceInventorySha256: sha(JSON.stringify(current)), sourceFiles: current,
    comparedSourceFiles: Object.keys(prior).length, sourceFileCount: Object.keys(current).length,
    comparison, retainedBaselineArchiveSha256: baseline.archiveSha256,
    retainedArchiveIntegrity: 'HASH_MATCH_ONLY_NOT_REPACKAGED',
    applicationApiWorkerSourceUnchanged: untouched(p => /^(?:api|src|worker)\//.test(p) || p === 'server.js'),
    reviewedDeploymentSchemaSourcesUnchanged: untouched(isDeploymentSchemaSource),
    schemaComparisonScope: 'REVIEWED_API_SCHEMA_MIGRATIONS_AND_SERVER_ONLY_NOT_LIVE_TARGET',
    otherSchemaNamedChanges: [...comparison.changed,...comparison.added,...comparison.missing]
      .filter(p => /schema|migration/i.test(p) && !isDeploymentSchemaSource(p)),
    dependencyFilesUnchanged: untouched(p => ['package.json','package-lock.json'].includes(p)),
    priorScannerLocations: {count: findings.length, identical: findings.filter(f => f.sourceMatches).length,
      mismatches: findings.filter(f => !f.sourceMatches).map(f => f.file),
      coverage: 'PRIOR_LOCATIONS_ONLY_NEW_SOURCE_NOT_FRESHLY_SCANNED'},
    b5: {status: 'CLOSED', evidence: b5Path, inboxDelivery: 'OWNER_ATTESTED', liveEscalationProven: false},
    evidenceReferences, currentFullCleanInstallGate: 'NOT_RUN_DATABASE_CONTACT_FORBIDDEN',
    currentManagedScans: 'NOT_RUN_OFFLINE_SCOPE', currentNativeRestore: 'NOT_IMPLEMENTED_OR_VERIFIED',
    productionCalls: 0, awsCalls: 0, databaseCalls: 0, storageCalls: 0,
    credentialsOrSessionsAccessed: false, productionPublished: false,
    operationsAuthorized: false};
  await writeReviewJson(base, 'source-and-evidence-review.json', result);
  console.log(JSON.stringify({verdict: result.verdict, sourceFiles: result.sourceFileCount,
    comparedFiles: result.comparedSourceFiles, changed: comparison.changed.length,
    added: comparison.added.length, missing: comparison.missing.length,
    apiWorkerUnchanged: result.applicationApiWorkerSourceUnchanged,
    dependencyFilesUnchanged: result.dependencyFilesUnchanged,
    retainedScannerLocations: result.priorScannerLocations, b5: 'CLOSED', productionCalls: 0}));
}
main().catch(() => { console.error('OFFLINE_REVIEW_FAILED_NO_OPERATION_AUTHORIZED'); process.exitCode=1; });
