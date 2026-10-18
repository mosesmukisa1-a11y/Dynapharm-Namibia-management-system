// No provider, database, filesystem, subprocess or application imports.
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';

export const EXECUTE = '--execute-owner-approved';
export const ACKNOWLEDGE = '--acknowledge-backup-writes-and-30-day-retention';
export const RETENTION_DAYS = 30;
const DAY = 86_400_000;
const CODES = new Set([
  'INVALID_FLAGS', 'MISSING_OWNER_FLAG', 'MISSING_ACKNOWLEDGEMENT', 'CONFIG_INVALID',
  'TEST_SOURCE_DENIED', 'TEST_IO_DENIED', 'TOOL_UNAVAILABLE', 'TOOL_INCOMPATIBLE',
  'OUTPUT_UNSAFE', 'DUMP_FAILED', 'ARCHIVE_INVALID', 'ARTIFACT_INVALID',
  'PROVIDER_PREFLIGHT_FAILED', 'PROVIDER_UPLOAD_FAILED', 'PROVIDER_VERIFY_FAILED',
  'LOCAL_WRITE_FAILED', 'INTERNAL_FAILURE',
]);
export class BackupJobError extends Error {
  constructor(code) {
    super(CODES.has(code) ? code : 'INTERNAL_FAILURE');
    this.code = this.message;
  }
}
export function inTestRuntime(env = {}) {
  return env.NODE_ENV === 'test' || Boolean(env.VITEST || env.NODE_TEST_CONTEXT) ||
    process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST || process.env.NODE_TEST_CONTEXT);
}
export function executionMode(args) {
  if (!Array.isArray(args) || new Set(args).size !== args.length ||
      args.some(a => !['--dry-run', EXECUTE, ACKNOWLEDGE].includes(a)) ||
      (args.includes('--dry-run') && args.length !== 1)) throw new BackupJobError('INVALID_FLAGS');
  if (args.includes(EXECUTE) && !args.includes(ACKNOWLEDGE)) throw new BackupJobError('MISSING_ACKNOWLEDGEMENT');
  if (args.includes(ACKNOWLEDGE) && !args.includes(EXECUTE)) throw new BackupJobError('MISSING_OWNER_FLAG');
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
function safeResult(code) {
  return CODES.has(code) ? code : 'INTERNAL_FAILURE';
}

export async function runBackup({
  args = [], env = {}, emit = () => {}, now = () => new Date(), uuid = randomUUID,
  loadIO = async () => { throw new BackupJobError('INTERNAL_FAILURE'); },
} = {}) {
  let stage = 'authorization', mode = 'dry-run';
  const log = (status, code) => emit({
    event: 'b2.backup', atUtc: new Date().toISOString(), mode, stage, status,
    ...(code ? {code: safeResult(code)} : {}),
  });
  try {
    mode = executionMode(args);
    stage = 'configuration';
    const {source, invalidFields} = validateConfig(env);
    if (mode === 'dry-run') {
      // No adapter is loaded, no executable checked, no filesystem touched.
      log('VALIDATION_ONLY');
      return {
        status: 'VALIDATION_ONLY', mode, configurationValid: invalidFields.length === 0,
        invalidFields, tools: {required: ['pg_dump', 'pg_restore', 'awscli2'], status: 'NOT_PROBED'},
        providerCalls: 0, databaseCalls: 0, storageCalls: 0,
      };
    }
    assertTestSource(env, source);
    if (invalidFields.length) throw new BackupJobError('CONFIG_INVALID');
    const started = now();
    const plan = {...backupPaths(started, uuid()), startedAtUtc: started.toISOString()};
    const config = {env, source, ...plan};
    stage = 'tools';
    const io = await loadIO({args: [...args], env: {...env}});
    await io.validateTools(config);
    stage = 'destination-preflight';
    await io.validateDestination(config);
    stage = 'local-staging';
    const run = await io.createRun(config);
    stage = 'dump';
    await io.dump(config, run);
    stage = 'archive-validation';
    await io.validateArchive(config, run);
    stage = 'artifact-validation';
    const dump = await io.inspect(run, 'database.dump');
    assertArtifact(dump);
    stage = 'upload-dump';
    const protectedDump = await io.upload(config, run, 'database.dump', dump);
    const manifest = {
      schemaVersion: 1, runId: plan.runId, startedAtUtc: plan.startedAtUtc,
      completedDumpAtUtc: now().toISOString(),
      scope: 'DATABASE_ONLY_OBJECTS_AND_CLUSTER_GLOBALS_NOT_INCLUDED',
      sourceIdentityRecorded: false,
      validation: {dumpExitZero: true, archiveListPassed: true, fullArchiveDecodePassed: true},
      retention: {mode: 'GOVERNANCE', minimumDays: RETENTION_DAYS, bypassAllowedByJob: false,
        noBypassPolicyAssurance: 'OWNER_ATTESTED_NOT_PROVIDER_VERIFIED'},
      artifacts: [{name: 'database.dump', ...dump, ...protectedDump}],
      recoveryObjectives: {rpoProven: false, rtoProven: false, fullB2Recovery: false},
    };
    stage = 'manifest';
    const manifestMeta = await io.write(run, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    assertArtifact(manifestMeta);
    await io.upload(config, run, 'manifest.json', manifestMeta);
    stage = 'checksums';
    const sums = `${dump.sha256}  database.dump\n${manifestMeta.sha256}  manifest.json\n`;
    const sumsMeta = await io.write(run, 'SHA256SUMS', sums);
    assertArtifact(sumsMeta);
    await io.upload(config, run, 'SHA256SUMS', sumsMeta);
    stage = 'completion';
    const complete = await io.write(run, 'COMPLETED.json', JSON.stringify({
      schemaVersion: 1, runId: plan.runId, manifestSha256: manifestMeta.sha256,
      checksumsSha256: sumsMeta.sha256, completedAtUtc: now().toISOString(),
    }) + '\n');
    assertArtifact(complete);
    await io.upload(config, run, 'COMPLETED.json', complete);
    log('COMPLETE_DATABASE_BACKUP');
    return {status: 'COMPLETE_DATABASE_BACKUP', mode, fullB2Recovery: false};
  } catch (error) {
    const code = error instanceof BackupJobError ? safeResult(error.code) : 'INTERNAL_FAILURE';
    log('FAILED', code);
    return {status: 'FAILED', mode, stage, code};
  }
}

export function retainedUntil(date) {
  // One-minute safety margin; head verification still enforces >=30 days from provider LastModified.
  return new Date(date.getTime() + RETENTION_DAYS * DAY + 60_000).toISOString();
}
