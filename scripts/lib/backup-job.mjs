// No provider, database, filesystem, subprocess or application imports.
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {BackupJobError, safeBackupCode} from './backup-job-errors.mjs';
import {
  WITH_OBJECTS, ACK_OBJECTS, assertObjectAcknowledgement, validateObjectManifest,
  assertManifestFresh, objectArtifactName,
} from './backup-object-manifest.mjs';
export {BackupJobError} from './backup-job-errors.mjs';

export const EXECUTE = '--execute-owner-approved';
export const ACKNOWLEDGE = '--acknowledge-backup-writes-and-30-day-retention';
export const RETENTION_DAYS = 30;
const DAY = 86_400_000;
export function inTestRuntime(env = {}) {
  return env.NODE_ENV === 'test' || Boolean(env.VITEST || env.NODE_TEST_CONTEXT) ||
    process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST || process.env.NODE_TEST_CONTEXT);
}
export function executionMode(args) {
  if (!Array.isArray(args) || new Set(args).size !== args.length ||
      args.some(a => !['--dry-run', EXECUTE, ACKNOWLEDGE, WITH_OBJECTS, ACK_OBJECTS].includes(a)) ||
      (args.includes('--dry-run') && args.some(a => !['--dry-run', WITH_OBJECTS].includes(a))) ||
      (args.includes(ACK_OBJECTS) && !args.includes(WITH_OBJECTS))) throw new BackupJobError('INVALID_FLAGS');
  if (args.includes(EXECUTE) && !args.includes(ACKNOWLEDGE)) throw new BackupJobError('MISSING_ACKNOWLEDGEMENT');
  if (args.includes(ACKNOWLEDGE) && !args.includes(EXECUTE)) throw new BackupJobError('MISSING_OWNER_FLAG');
  if (args.includes(ACK_OBJECTS) && !args.includes(EXECUTE)) throw new BackupJobError('MISSING_OWNER_FLAG');
  return args.includes(EXECUTE) && args.includes(ACKNOWLEDGE) ? 'execute' : 'dry-run';
}
export function backupPaths(date, id) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new BackupJobError('CONFIG_INVALID');
  }
  const iso = date.toISOString();
  const runId = `${iso.replace(/[-:.]/g, '')}_${id}`;
  return {runId, prefix: `b2/database/${iso.slice(0, 10).replaceAll('-', '/')}/${runId}`};
}
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
export function assertArtifact(meta) {
  if (!meta || !Number.isSafeInteger(meta.bytes) || meta.bytes <= 0 ||
      meta.bytes > 5_000_000_000 || !/^[a-f0-9]{64}$/.test(meta.sha256)) {
    throw new BackupJobError('ARTIFACT_INVALID');
  }
}
export function validateConfig(env) {
  const fields = [
    'B2_BACKUP_DATABASE_URL', 'B2_BACKUP_SOURCE_CLASS', 'B2_BACKUP_OUTPUT_DIR',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BACKUP_BUCKET', 'AWS_REGION',
    'B2_BACKUP_KMS_KEY_ARN', 'B2_BACKUP_ENCRYPTED_OUTPUT_CONFIRMED',
    'B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED',
  ];
  const invalid = new Set(fields.filter(f => typeof env[f] !== 'string' || !env[f].trim()));
  let source;
  try {
    source = new URL(env.B2_BACKUP_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(source.protocol) || !source.hostname ||
        !source.username || !source.pathname.slice(1) || source.hash ||
        [...source.searchParams.keys()].some(k => k !== 'sslmode') ||
        source.searchParams.getAll('sslmode').length > 1) invalid.add('B2_BACKUP_DATABASE_URL');
    // Validate percent decoding before any child process is possible.
    for (const value of [source.username, source.password, source.pathname.slice(1)]) {
      if (/[\0\r\n]/.test(decodeURIComponent(value))) invalid.add('B2_BACKUP_DATABASE_URL');
    }
    // PGDATABASE must remain a database name, never a nested libpq URI/option string.
    if (!/^[A-Za-z0-9_.-]+$/.test(decodeURIComponent(source.pathname.slice(1)))) {
      invalid.add('B2_BACKUP_DATABASE_URL');
    }
  } catch { invalid.add('B2_BACKUP_DATABASE_URL'); }
  if (!['production', 'isolated'].includes(env.B2_BACKUP_SOURCE_CLASS)) invalid.add('B2_BACKUP_SOURCE_CLASS');
  const output = env.B2_BACKUP_OUTPUT_DIR || '';
  if (!path.isAbsolute(output) || path.normalize(output) !== output || output === '/' ||
      /(?:^|\/)uploads(?:\/|$)|[\0\r\n]/.test(output)) invalid.add('B2_BACKUP_OUTPUT_DIR');
  if (!/^(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.AWS_BACKUP_BUCKET || '') ||
      (env.AWS_BACKUP_BUCKET || '').includes('..') || (env.AWS_BACKUP_BUCKET || '').endsWith('--x-s3')) {
    invalid.add('AWS_BACKUP_BUCKET');
  }
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(env.AWS_REGION || '')) invalid.add('AWS_REGION');
  const arn = (env.B2_BACKUP_KMS_KEY_ARN || '').match(/^arn:aws(?:-us-gov|-cn)?:kms:([^:]+):\d{12}:key\/[a-f0-9-]{36}$/);
  if (!arn || arn[1] !== env.AWS_REGION) invalid.add('B2_BACKUP_KMS_KEY_ARN');
  for (const field of ['B2_BACKUP_ENCRYPTED_OUTPUT_CONFIRMED', 'B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED']) {
    if (env[field] !== 'true') invalid.add(field);
  }
  if (env.B2_BACKUP_SOURCE_CLASS === 'production' &&
      (!source?.password || source.searchParams.get('sslmode') !== 'verify-full' ||
       !path.isAbsolute(env.B2_BACKUP_PG_ROOT_CERT || ''))) invalid.add('B2_BACKUP_PG_ROOT_CERT');
  if (env.B2_BACKUP_SOURCE_CLASS === 'isolated' && !ownedIsolatedSource(source, env)) {
    invalid.add('B2_BACKUP_DATABASE_URL');
  }
  return {invalidFields: [...invalid].sort(), source};
}
function ownedIsolatedSource(source, env) {
  const owner = env.B2_BACKUP_TEST_OWNER || '';
  return /^[a-f0-9]{32}$/.test(owner) && source &&
    ['127.0.0.1', '[::1]', 'localhost'].includes(source.hostname) &&
    source.port && source.port !== '5432' &&
    source.pathname === `/b2_backup_test_${owner}` &&
    ['disable', 'verify-full'].includes(source.searchParams.get('sslmode'));
}
function assertTestSource(env, source) {
  if (inTestRuntime(env) &&
      (env.B2_BACKUP_SOURCE_CLASS !== 'isolated' || !ownedIsolatedSource(source, env))) {
    throw new BackupJobError('TEST_SOURCE_DENIED');
  }
}
export async function runBackup({
  args = [], env = {}, emit = () => {}, now = () => new Date(), uuid = randomUUID,
  objectManifestJson,
  loadIO = async () => { throw new BackupJobError('INTERNAL_FAILURE'); },
} = {}) {
  let stage = 'authorization', mode = 'dry-run';
  const log = (status, code) => emit({
    event: 'b2.backup', atUtc: new Date().toISOString(), mode, stage, status,
    ...(code ? {code: safeBackupCode(code)} : {}),
  });
  try {
    if (Array.isArray(args)) args = Object.freeze([...args]);
    env = Object.freeze({...env});
    mode = executionMode(args);
    assertObjectAcknowledgement(args, mode);
    const objectMode = args.includes(WITH_OBJECTS);
    const suppliedManifest = objectManifestJson ?? env.B2_BACKUP_OBJECT_MANIFEST_JSON;
    stage = 'object-manifest-validation';
    if (!objectMode && suppliedManifest !== undefined) throw new BackupJobError('MANIFEST_MODE_REQUIRED');
    const approved = objectMode ? validateObjectManifest(suppliedManifest, env, now()) : null;
    stage = 'configuration';
    const {source, invalidFields} = validateConfig(env);
    if (mode === 'dry-run') {
      // No adapter is loaded, no executable checked, no filesystem touched.
      log('VALIDATION_ONLY');
      return {
        status: 'VALIDATION_ONLY', mode, configurationValid: invalidFields.length === 0,
        invalidFields, tools: {required: ['pg_dump', 'pg_restore', 'awscli2'], status: 'NOT_PROBED'},
        providerCalls: 0, databaseCalls: 0, storageCalls: 0,
        ...(approved ? {objectManifest: {status: 'VALIDATED', objectCount: approved.objectCount, totalBytes: approved.totalBytes}} : {}),
      };
    }
    assertTestSource(env, source);
    if (invalidFields.length) throw new BackupJobError('CONFIG_INVALID');
    const started = now();
    const plan = {...backupPaths(started, uuid()), startedAtUtc: started.toISOString()};
    const config = {env, source, ...plan};
    stage = 'tools';
    const io = await loadIO({args: [...args], env: {...env}, objectManifestJson: suppliedManifest});
    await io.validateTools(config);
    stage = 'destination-preflight';
    await io.validateDestination(config);
    stage = 'local-staging';
    const run = await io.createRun(config);
    stage = 'dump';
    const dumpStartedAtUtc = now().toISOString();
    await io.dump(config, run);
    const completedDumpAtUtc = now().toISOString();
    stage = 'archive-validation';
    await io.validateArchive(config, run);
    stage = 'artifact-validation';
    const dump = await io.inspect(run, 'database.dump');
    assertArtifact(dump);
    stage = 'upload-dump';
    const protectedDump = await io.upload(config, run, 'database.dump', dump);
    const sumsEntries = [{name: 'database.dump', ...dump}];
    const objects = [];
    let objectCaptureStartedAtUtc, objectCaptureCompletedAtUtc;
    let objectManifestMeta, protectedObjectManifest;
    if (approved) {
      objectCaptureStartedAtUtc = now().toISOString();
      for (let index = 0; index < approved.objectCount; index++) {
        stage = 'object-capture';
        assertManifestFresh(approved.manifest, now());
        const expected = approved.manifest.objects[index];
        const meta = await io.captureObject(config, run, index);
        assertArtifact(meta);
        if (meta.bytes !== expected.bytes || meta.sha256 !== expected.sourceIdentity.sha256) {
          throw new BackupJobError('SOURCE_OBJECT_MISMATCH');
        }
        assertManifestFresh(approved.manifest, now());
        stage = 'object-upload';
        const name = objectArtifactName(index);
        const protectedObject = await io.upload(config, run, name, meta);
        objects.push({name, ...meta, ...protectedObject});
        sumsEntries.push({name, ...meta});
      }
      objectCaptureCompletedAtUtc = now().toISOString();
      stage = 'object-manifest';
      assertManifestFresh(approved.manifest, now());
      objectManifestMeta = await io.write(run, 'object-manifest.json', approved.text);
      assertArtifact(objectManifestMeta);
      if (objectManifestMeta.sha256 !== approved.sha256 || objectManifestMeta.bytes !== Buffer.byteLength(approved.text)) {
        throw new BackupJobError('SOURCE_OBJECT_MISMATCH');
      }
      protectedObjectManifest = await io.upload(config, run, 'object-manifest.json', objectManifestMeta);
      sumsEntries.push({name: 'object-manifest.json', ...objectManifestMeta});
    }
    const manifest = {
      schemaVersion: approved ? 2 : 1, runId: plan.runId, startedAtUtc: plan.startedAtUtc,
      completedDumpAtUtc,
      scope: approved ? 'DATABASE_AND_MANIFEST_REFERENCED_OBJECTS_NO_ATOMICITY_PROOF' : 'DATABASE_ONLY_OBJECTS_AND_CLUSTER_GLOBALS_NOT_INCLUDED',
      sourceIdentityRecorded: false,
      validation: {dumpExitZero: true, archiveListPassed: true, fullArchiveDecodePassed: true},
      retention: {mode: 'GOVERNANCE', minimumDays: RETENTION_DAYS, bypassAllowedByJob: false,
        noBypassPolicyAssurance: 'OWNER_ATTESTED_NOT_PROVIDER_VERIFIED'},
      artifacts: [{name: 'database.dump', ...dump, ...protectedDump}],
      recoveryObjectives: {rpoProven: false, rtoProven: false, fullB2Recovery: false},
      ...(approved ? {
        objectManifest: {name: 'object-manifest.json', ...objectManifestMeta, ...protectedObjectManifest},
        objects,
        backupSet: {
          id: approved.manifest.backupSetId, databaseArtifactSha256: dump.sha256,
          objectManifestSha256: approved.sha256,
          databaseIdentityFingerprint: approved.manifest.source.databaseIdentityFingerprint,
          sourceBucketIdentitySha256: approved.manifest.source.bucketIdentitySha256,
          referenceSnapshotSha256: approved.manifest.source.referenceSnapshotSha256,
          objectCount: approved.objectCount, totalBytes: approved.totalBytes,
          databaseDumpStartedAtUtc: dumpStartedAtUtc, databaseDumpCompletedAtUtc: completedDumpAtUtc,
          objectCaptureStartedAtUtc, objectCaptureCompletedAtUtc,
          manifestSourceCapturedAtUtc: approved.manifest.source.capturedAtUtc,
          crossResourceAtomicity: false, providerSnapshotVerified: false,
          sourceIdentityAssurance: 'OWNER_ATTESTED_CONTENT_VERIFIED',
        },
      } : {}),
    };
    stage = 'manifest';
    const manifestMeta = await io.write(run, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    assertArtifact(manifestMeta);
    await io.upload(config, run, 'manifest.json', manifestMeta);
    stage = 'checksums';
    sumsEntries.push({name: 'manifest.json', ...manifestMeta});
    const sums = sumsEntries.map(item => `${item.sha256}  ${item.name}\n`).join('');
    const sumsMeta = await io.write(run, 'SHA256SUMS', sums);
    assertArtifact(sumsMeta);
    await io.upload(config, run, 'SHA256SUMS', sumsMeta);
    stage = 'completion';
    if (approved) assertManifestFresh(approved.manifest, now());
    const complete = await io.write(run, 'COMPLETED.json', JSON.stringify({
      schemaVersion: approved ? 2 : 1, runId: plan.runId, manifestSha256: manifestMeta.sha256,
      checksumsSha256: sumsMeta.sha256, completedAtUtc: now().toISOString(),
      ...(approved ? {backupSetId: approved.manifest.backupSetId, objectManifestSha256: approved.sha256} : {}),
    }) + '\n');
    assertArtifact(complete);
    if (approved) assertManifestFresh(approved.manifest, now());
    await io.upload(config, run, 'COMPLETED.json', complete);
    const status = approved ? 'COMPLETE_MANIFEST_BACKUP_SET' : 'COMPLETE_DATABASE_BACKUP';
    log(status);
    return {status, mode, fullB2Recovery: false};
  } catch (error) {
    const code = error instanceof BackupJobError ? safeBackupCode(error.code) : 'INTERNAL_FAILURE';
    log('FAILED', code);
    return {status: 'FAILED', mode, stage, code};
  }
}

export function retainedUntil(date) {
  // One-minute safety margin; head verification still enforces >=30 days from provider LastModified.
  return new Date(date.getTime() + RETENTION_DAYS * DAY + 60_000).toISOString();
}
