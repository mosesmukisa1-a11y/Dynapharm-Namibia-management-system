// Synthetic-only capability: deliberately has NO database, provider, filesystem,
// process, environment, network, arbitrary adapter or destination-path interface.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validateObjectManifest} from './backup-object-manifest.mjs';
import {assertSchema} from './synthetic-restore-schema.mjs';
import {makeSyntheticFixture, digest, FIXTURE_CLOCK, CLEANUP_PLAN, DATABASE_CONTENT} from './synthetic-restore-fixture.mjs';

export const RUN = '--run-synthetic-rehearsal';
export const ACK = '--acknowledge-disposable-cleanup';
const used = new Set();
function fail(code) { throw Error(code); }
function validate(text, schemas, now) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 100_000) fail('FIXTURE_INVALID');
  const fixture = JSON.parse(text);
  if (JSON.stringify(fixture) !== text) fail('FIXTURE_INVALID');
  if (fixture.kind !== 'SYNTHETIC_NON_PRODUCTION_ONLY' || fixture.source !== 'synthetic://generated-no-provider') fail('SOURCE_DENIED');
  if (fixture.cleanupPlan !== CLEANUP_PLAN) fail('CLEANUP_PLAN_REQUIRED');
  if (!Array.isArray(fixture.files) || fixture.files.length !== 8) fail('PARTIAL_SET');
  const files = new Map();
  for (const f of fixture.files) {
    if (typeof f.name !== 'string' || !/^(database\.dump|object-00000[1-3]\.bin|object-manifest\.json|manifest\.json|SHA256SUMS|COMPLETED\.json)$/.test(f.name) ||
        files.has(f.name)) fail('PATH_OR_DUPLICATE');
    if (typeof f.text !== 'string' || Buffer.byteLength(f.text) !== f.bytes || digest(f.text) !== f.sha256) fail('ARTIFACT_MISMATCH');
    if (f.versionId !== `synthetic-version-${f.name}`) fail('VERSION_MISMATCH');
    files.set(f.name, f);
  }
  if (!files.has('COMPLETED.json')) fail('COMPLETION_REQUIRED');
  const m = JSON.parse(files.get('manifest.json').text);
  const om = JSON.parse(files.get('object-manifest.json').text);
  assertSchema(fixture.databaseManifest, 'b2-backup-manifest.schema.json', schemas);
  assertSchema(m, 'b2-backup-set.schema.json', schemas);
  assertSchema(om, 'b2-authorized-object-manifest.schema.json', schemas);
  validateObjectManifest(files.get('object-manifest.json').text, {
    B2_BACKUP_OBJECT_MANIFEST_SHA256: files.get('object-manifest.json').sha256,
    B2_BACKUP_APP_STORAGE_BUCKET_SHA256: digest('replit_app_storage:synthetic-never-contact'),
    B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT: digest('SYNTHETIC_DATABASE_NO_CONNECTION'),
  }, now);
  const done = JSON.parse(files.get('COMPLETED.json').text);
  if (done.manifestSha256 !== files.get('manifest.json').sha256 ||
      done.checksumsSha256 !== files.get('SHA256SUMS').sha256 ||
      done.objectManifestSha256 !== files.get('object-manifest.json').sha256 ||
      done.backupSetId !== m.backupSet.id || done.runId !== m.runId) fail('COMPLETION_MISMATCH');
  for (const meta of [...m.artifacts, ...m.objects, m.objectManifest]) {
    const f = files.get(meta.name);
    if (!f || ['bytes', 'sha256', 'versionId', 'retainUntilUtc'].some(k => meta[k] !== f[k])) fail('ARTIFACT_MISMATCH');
  }
  const expectedSums = [...m.artifacts, ...m.objects, m.objectManifest, files.get('manifest.json')]
    .map(f => `${f.sha256}  ${f.name}\n`).join('');
  if (files.get('SHA256SUMS').text !== expectedSums) fail('CHECKSUM_LIST_MISMATCH');
  let decoded;
  try { decoded = JSON.parse(files.get('database.dump').text); }
  catch { fail('SYNTHETIC_ARCHIVE_INVALID'); }
  if (JSON.stringify(decoded) !== JSON.stringify(DATABASE_CONTENT)) fail('SYNTHETIC_ARCHIVE_INVALID');
  // Last admission gate: no caller-supplied data can masquerade as a synthetic source,
  // even when an attacker regenerates valid checksums and synthetic-looking metadata.
  if (text !== JSON.stringify(makeSyntheticFixture())) fail('NOT_GENERATED_SYNTHETIC_FIXTURE');
  return {files, m, om, decoded};
}

export async function rehearse(options = {}) {
  const start = performance.now();
  const result = {classification: 'NON-PRODUCTION', status: 'FAIL', mode: 'validation-only',
    stages: [], providerOperations: 0, databaseOperations: 0, storageOperations: 0,
    destinationCreated: false, cleanupVerified: false, rpoProven: false, rtoProven: false, b2Closed: false};
  let memory;
  let activeStage = 'preflight';
  const stage = (name, status) => result.stages.push({name, status});
  try {
    if (Object.keys(options).some(k => !['args', 'fixtureJson', 'schemas', 'now', 'failAt'].includes(k))) fail('OPTION_DENIED');
    const args = options.args ?? [];
    if (!Array.isArray(args) || new Set(args).size !== args.length ||
        args.some(a => ![RUN, ACK, '--validate-only'].includes(a)) ||
        (args.includes('--validate-only') && args.length !== 1) ||
        (args.includes(ACK) && !args.includes(RUN))) fail('FLAGS_DENIED');
    if (args.includes(RUN) && !args.includes(ACK)) fail('ACK_REQUIRED');
    if (options.failAt !== undefined && !['database', 'object-2', 'completion', 'cleanup', 'cleanup-verification'].includes(options.failAt)) fail('FAULT_DENIED');
    const now = options.now ?? new Date(FIXTURE_CLOCK);
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('CLOCK_INVALID');
    // Snapshot all externally supplied JSON before the first await.
    const approved = validate(options.fixtureJson ?? JSON.stringify(makeSyntheticFixture()),
      JSON.parse(JSON.stringify(options.schemas)), now);
    stage('preflight-all-artifacts-schemas-authorization', 'PASS');
    stage('synthetic-archive-structure-and-content', 'PASS');
    if (!args.includes(RUN)) {
      result.status = 'PASS';
      result.cleanup = 'NOT_REQUIRED_NO_DESTINATION';
      return result;
    }
    result.mode = 'memory-disposable-rehearsal';
    const destination = `synthetic-disposable-${randomUUID()}`;
    if (used.has(destination)) fail('DESTINATION_REUSE');
    used.add(destination);
    result.destinationId = destination;
    memory = new Map();
    result.destinationCreated = true;
    const check = name => { if (options.failAt === name) fail('INJECTED_SYNTHETIC_FAILURE'); };
    activeStage = 'database-synthetic-restore';
    check('database');
    memory.set('synthetic-database', JSON.stringify(approved.decoded));
    stage('database-synthetic-restore', 'PASS');
    for (let i = 0; i < approved.m.objects.length; i++) {
      activeStage = `object-${i + 1}-restore-and-checksum`;
      check(`object-${i + 1}`);
      const bytes = approved.files.get(approved.m.objects[i].name).text;
      if (digest(bytes) !== approved.om.objects[i].sourceIdentity.sha256) fail('RESTORE_CHECKSUM');
      memory.set(approved.om.objects[i].key, bytes);
      stage(`object-${i + 1}-restore-and-checksum`, 'PASS');
    }
    activeStage = 'restored-set-content-verification';
    check('completion');
    if (memory.size !== 4 || memory.get('synthetic-database') !== JSON.stringify(DATABASE_CONTENT)) fail('RESTORE_CONTENT');
    for (const o of approved.om.objects) {
      if (digest(memory.get(o.key)) !== o.sourceIdentity.sha256 ||
          Buffer.byteLength(memory.get(o.key)) !== o.bytes) fail('RESTORE_CHECKSUM');
    }
    stage('restored-set-content-verification', 'PASS');
    memory.set('RESTORE_COMPLETED', approved.files.get('COMPLETED.json').sha256);
    stage('restore-completion-marker-last', 'PASS');
    result.status = 'PASS';
  } catch (error) {
    // Codes are allowlisted below; raw errors, paths, source values and stacks never escape.
    const safe = new Set(['FIXTURE_INVALID', 'SOURCE_DENIED', 'CLEANUP_PLAN_REQUIRED', 'PARTIAL_SET',
      'PATH_OR_DUPLICATE', 'ARTIFACT_MISMATCH', 'VERSION_MISMATCH', 'COMPLETION_REQUIRED',
      'COMPLETION_MISMATCH', 'CHECKSUM_LIST_MISMATCH', 'NOT_GENERATED_SYNTHETIC_FIXTURE',
      'SYNTHETIC_ARCHIVE_INVALID', 'OPTION_DENIED', 'FLAGS_DENIED', 'ACK_REQUIRED', 'FAULT_DENIED',
      'CLOCK_INVALID', 'DESTINATION_REUSE', 'INJECTED_SYNTHETIC_FAILURE', 'RESTORE_CHECKSUM', 'RESTORE_CONTENT',
      'SCHEMA_VALUE', 'SCHEMA_CONTRACT', 'MANIFEST_INVALID', 'MANIFEST_EXPIRED']);
    result.errorCode = safe.has(error?.code) ? error.code : safe.has(error?.message) ? error.message : 'VALIDATION_FAILED';
    result.restoreCompletionCreated = memory?.has('RESTORE_COMPLETED') ?? false;
    stage(activeStage, 'FAIL');
  } finally {
    if (memory) {
      result.restoreCompletionCreated = memory.has('RESTORE_COMPLETED');
      const injected = ['cleanup', 'cleanup-verification'].includes(options.failAt);
      if (!injected) memory.clear();
      result.cleanupPrimary = injected ? 'FAIL' : 'PASS';
      if (injected) {
        result.status = 'FAIL';
        result.errorCode = 'CLEANUP_VERIFICATION_FAILED';
        stage('cleanup-primary', 'FAIL');
        // Unconditional owner-local memory teardown, never remote retained-object deletion.
        memory.clear();
        stage('cleanup-emergency-memory-teardown', 'PASS');
      }
      result.cleanupVerified = memory.size === 0;
      result.remainingSyntheticEntries = memory.size;
      stage('cleanup-empty-verification', result.cleanupVerified ? 'PASS' : 'FAIL');
    }
    result.syntheticAsOfUtc = FIXTURE_CLOCK;
    result.localElapsedMs = Number((performance.now() - start).toFixed(3));
    result.timingBasis = 'LOCAL_SYNTHETIC_ONLY_NOT_PRODUCTION_RTO';
  }
  return result;
}
