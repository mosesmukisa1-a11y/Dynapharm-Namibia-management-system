import {syntheticCredential, syntheticCredentialUrl} from './lib/synthetic-credential-fixture.mjs';
// Offline only. Every execution-stage test uses memory fakes; no pg_dump/AWS/SDK.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  ACKNOWLEDGE, EXECUTE, BackupJobError, assertArtifact, backupPaths, executionMode,
  retainedUntil, runBackup, sha256, validateConfig,
} from './lib/backup-job.mjs';
import {
  assertDestination, assertRemoteArtifact, createBackupIO, postgresEnvironment, toolEnvironment,
} from './lib/backup-job-io.mjs';

const owner = '0123456789abcdef0123456789abcdef';
const id = '01234567-89ab-4cde-8f01-23456789abcd';
const date = new Date('2026-10-18T12:34:56.789Z');
const flags = [EXECUTE, ACKNOWLEDGE];
const fakeSecret = syntheticCredential('uri');
const kms = 'arn:aws:kms:eu-west-1:000000000000:key/01234567-89ab-4cde-8f01-23456789abcd';
const env = {
  NODE_ENV: 'test', B2_BACKUP_SOURCE_CLASS: 'isolated', B2_BACKUP_TEST_OWNER: owner,
  B2_BACKUP_DATABASE_URL: syntheticCredentialUrl({local: true}),
  B2_BACKUP_OUTPUT_DIR: '/synthetic-private-backups', AWS_ACCESS_KEY_ID: fakeSecret,
  AWS_SECRET_ACCESS_KEY: fakeSecret, AWS_BACKUP_BUCKET: 'synthetic-never-contact',
  AWS_REGION: 'eu-west-1', B2_BACKUP_KMS_KEY_ARN: kms,
  B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED: 'true', B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED: 'true',
};
function fixture(options = {}) {
  const calls = [], logs = [], files = new Map();
  const meta = {bytes: 123, sha256: sha256(Buffer.from('synthetic nonempty dump'))};
  const io = {};
  for (const name of ['validateTools', 'validateDestination', 'createRun', 'dump', 'validateArchive', 'inspect', 'write', 'upload']) {
    io[name] = async (...args) => {
      calls.push(name);
      if (options.fail === name) throw options.error || new BackupJobError('ARCHIVE_INVALID');
      if (name === 'createRun') return {directory: '/synthetic-private-run'};
      if (name === 'inspect') return options.meta || meta;
      if (name === 'write') {
        files.set(args[1], args[2]);
        return {bytes: Buffer.byteLength(args[2]), sha256: sha256(args[2])};
      }
      if (name === 'upload') return {versionId: 'synthetic-version', retainUntilUtc: retainedUntil(date)};
    };
  }
  const run = overrides => runBackup({
    args: flags, env, now: () => date, uuid: () => id,
    emit: value => logs.push(value),
    loadIO: async () => { calls.push('loadIO'); return io; }, ...overrides,
  });
  return {calls, logs, files, run};
}

for (const args of [[], ['--dry-run']]) test(`dry-run ${JSON.stringify(args)} has zero side effects even with credentials`, async () => {
  const f = fixture();
  const result = await f.run({args, env: {...env, B2_BACKUP_EXECUTE: 'true', BACKUP_ENABLED: 'true'}});
  assert.equal(result.status, 'VALIDATION_ONLY');
  assert.equal(result.configurationValid, true);
  assert.equal(result.tools.status, 'NOT_PROBED');
  assert.deepEqual(f.calls, []);
  assert.deepEqual([result.providerCalls, result.databaseCalls, result.storageCalls], [0, 0, 0]);
  assert(!JSON.stringify([result, f.logs]).includes(fakeSecret));
});
test('missing config yields field names only and never loads IO', async () => {
  const f = fixture(), result = await f.run({args: [], env: {}});
  assert.equal(result.configurationValid, false);
  assert(result.invalidFields.includes('B2_BACKUP_DATABASE_URL'));
  assert.deepEqual(f.calls, []);
});
for (const [args, code] of [
  [[EXECUTE], 'MISSING_ACKNOWLEDGEMENT'], [[ACKNOWLEDGE], 'MISSING_OWNER_FLAG'],
  [['--dry-run', ...flags], 'INVALID_FLAGS'], [[EXECUTE, EXECUTE, ACKNOWLEDGE], 'INVALID_FLAGS'],
  [['--bypass-governance-retention'], 'INVALID_FLAGS'], [[fakeSecret], 'INVALID_FLAGS'],
]) test(`execution gates reject ${code} before IO`, async () => {
  const f = fixture(), result = await f.run({args});
  assert.equal(result.code, code);
  assert.deepEqual(f.calls, []);
  assert(!JSON.stringify([result, f.logs]).includes(fakeSecret));
});
test('production source during tests is denied before any IO', async () => {
  const f = fixture();
  const result = await f.run({env: {...env, B2_BACKUP_SOURCE_CLASS: 'production',
    B2_BACKUP_DATABASE_URL: syntheticCredentialUrl({local: false}),
    B2_BACKUP_PG_ROOT_CERT: '/synthetic-ca.pem'}});
  assert.equal(result.code, 'TEST_SOURCE_DENIED');
  assert.deepEqual(f.calls, []);
});
for (const change of [
  {B2_BACKUP_TEST_OWNER: ''},
  {B2_BACKUP_DATABASE_URL: 'postgresql://synthetic@127.0.0.1:5432/production?sslmode=disable'},
  {B2_BACKUP_DATABASE_URL: `postgresql://synthetic@production.invalid:65432/b2_backup_test_${owner}?sslmode=disable`},
]) test('unowned or non-loopback test source cannot pass execution', async () => {
  const f = fixture(), result = await f.run({env: {...env, ...change}});
  assert.equal(result.code, 'TEST_SOURCE_DENIED');
  assert.deepEqual(f.calls, []);
});
test('real adapter independently enforces both flags and always refuses test runtime', () => {
  assert.throws(() => createBackupIO(), {code: 'MISSING_OWNER_FLAG'});
  assert.throws(() => createBackupIO({args: [EXECUTE], env}), {code: 'MISSING_ACKNOWLEDGEMENT'});
  assert.throws(() => createBackupIO({args: flags, env}), {code: 'TEST_IO_DENIED'});
});
test('safe timestamped paths are UTC and traversal-free', () => {
  assert.deepEqual(backupPaths(date, id), {
    runId: `20261018T123456789Z_${id}`,
    prefix: `b2/database/2026/10/18/20261018T123456789Z_${id}`,
  });
  assert.throws(() => backupPaths(date, '../private'), {code: 'CONFIG_INVALID'});
  assert.throws(() => backupPaths(new Date('invalid'), id), {code: 'CONFIG_INVALID'});
});
test('SHA-256 known vector and byte sensitivity', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(sha256('abc'), sha256('abcd'));
});
for (const meta of [
  {bytes: 0, sha256: sha256('')}, {bytes: -1, sha256: sha256('x')},
  {bytes: 3, sha256: 'incomplete'}, {bytes: 5_000_000_001, sha256: sha256('x')},
]) test('empty, malformed or oversized artifacts cannot upload or complete', async () => {
  const f = fixture({meta}), result = await f.run();
  assert.equal(result.code, 'ARTIFACT_INVALID');
  assert(!f.calls.includes('upload'));
  assert(!f.files.has('COMPLETED.json'));
});
for (const name of ['dump', 'validateArchive']) test(`failed ${name} never uploads incomplete archive`, async () => {
  const f = fixture({fail: name}), result = await f.run();
  assert.equal(result.status, 'FAILED');
  assert(!f.calls.includes('upload'));
});
test('arbitrary errors cannot leak credentials, URLs, stderr or stack', async () => {
  const f = fixture({fail: 'dump', error: new Error(`${env.B2_BACKUP_DATABASE_URL}\n${fakeSecret}\nRAW_STDERR`)});
  const result = await f.run(), output = JSON.stringify([result, f.logs]);
  assert.equal(result.code, 'INTERNAL_FAILURE');
  for (const value of [fakeSecret, env.B2_BACKUP_DATABASE_URL, 'RAW_STDERR', '/synthetic-private-run']) assert(!output.includes(value));
});
test('mocked complete flow validates before uploads and publishes completion last', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.status, 'COMPLETE_DATABASE_BACKUP');
  assert.equal(result.fullB2Recovery, false);
  assert(f.calls.indexOf('validateArchive') < f.calls.indexOf('upload'));
  const manifest = JSON.parse(f.files.get('manifest.json'));
  assert.equal(manifest.retention.mode, 'GOVERNANCE');
  assert.equal(manifest.retention.minimumDays, 30);
  assert.equal(manifest.retention.bypassAllowedByJob, false);
  assert.equal(manifest.sourceIdentityRecorded, false);
  assert.equal(manifest.recoveryObjectives.fullB2Recovery, false);
  const completed = JSON.parse(f.files.get('COMPLETED.json'));
  assert.equal(completed.manifestSha256, sha256(f.files.get('manifest.json')));
  assert.equal(completed.checksumsSha256, sha256(f.files.get('SHA256SUMS')));
  assert(f.files.get('SHA256SUMS').includes(`${completed.manifestSha256}  manifest.json`));
  assert.deepEqual([...f.files.keys()], ['manifest.json', 'SHA256SUMS', 'COMPLETED.json']);
  assert(!JSON.stringify([...f.files.values()]).includes(fakeSecret));
});
test('destination policy must be versioned, locked, Governance and exactly 30 days', () => {
  const good = {ObjectLockConfiguration: {ObjectLockEnabled: 'Enabled', Rule: {DefaultRetention: {Mode: 'GOVERNANCE', Days: 30}}}};
  assert.doesNotThrow(() => assertDestination({Status: 'Enabled'}, good));
  for (const retention of [{Mode: 'GOVERNANCE', Days: 1}, {Mode: 'COMPLIANCE', Days: 30}, {}]) {
    assert.throws(() => assertDestination({Status: 'Enabled'},
      {ObjectLockConfiguration: {ObjectLockEnabled: 'Enabled', Rule: {DefaultRetention: retention}}}),
    {code: 'PROVIDER_PREFLIGHT_FAILED'});
  }
  assert.throws(() => assertDestination({}, good), {code: 'PROVIDER_PREFLIGHT_FAILED'});
});
test('remote verification checks checksum, version, size, KMS and >=30-day retention', () => {
  const meta = {bytes: 12, sha256: sha256('synthetic')};
  const head = {VersionId: 'v1', ContentLength: 12, ChecksumSHA256: Buffer.from(meta.sha256, 'hex').toString('base64'),
    ServerSideEncryption: 'aws:kms', SSEKMSKeyId: kms, ObjectLockMode: 'GOVERNANCE',
    LastModified: date.toISOString(), ObjectLockRetainUntilDate: retainedUntil(date)};
  assert.doesNotThrow(() => assertRemoteArtifact(head, {VersionId: 'v1'}, meta, kms));
  for (const patch of [{ContentLength: 0}, {ChecksumSHA256: 'bad'}, {VersionId: 'other'},
    {SSEKMSKeyId: 'other'}, {ObjectLockMode: 'COMPLIANCE'}, {ObjectLockRetainUntilDate: date.toISOString()}]) {
    assert.throws(() => assertRemoteArtifact({...head, ...patch}, {VersionId: 'v1'}, meta, kms), {code: 'PROVIDER_VERIFY_FAILED'});
  }
});
test('child environments drop arbitrary endpoints/services and never put credentials in command args', () => {
  const polluted = {...env, AWS_ENDPOINT_URL: 'https://synthetic.invalid', PGSERVICE: 'production',
    PGOPTIONS: 'unsafe', LD_PRELOAD: '/synthetic', DATABASE_URL: 'never-used', PATH: '/synthetic/bin'};
  assert.deepEqual(toolEnvironment(polluted), {PATH: '/synthetic/bin', LC_ALL: 'C'});
  const pg = postgresEnvironment(polluted, new URL(env.B2_BACKUP_DATABASE_URL));
  assert.equal(pg.PGPASSWORD, fakeSecret);
  assert.equal(pg.PGSERVICE, undefined);
  assert.equal(pg.DATABASE_URL, undefined);
  assert(pg.PGOPTIONS.includes('default_transaction_read_only=on'));
});
test('unsafe config is rejected without returning private values', () => {
  for (const patch of [{B2_BACKUP_OUTPUT_DIR: '/app/uploads'}, {B2_BACKUP_OUTPUT_DIR: '/'},
    {B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED: 'false'}, {AWS_REGION: fakeSecret},
    {B2_BACKUP_DATABASE_URL: `${env.B2_BACKUP_DATABASE_URL}&options=unsafe`},
    {B2_BACKUP_DATABASE_URL: 'postgresql://synthetic@127.0.0.1:65432/postgresql%3A%2F%2Fother.invalid%2Fdb?sslmode=disable'}]) {
    assert(validateConfig({...env, ...patch}).invalidFields.length > 0);
  }
});
test('manifest schema is packaged and mock manifest follows its closed field contract', async () => {
  const schema = JSON.parse(await fs.readFile(new URL('../docs/schemas/b2-backup-manifest.schema.json', import.meta.url)));
  const f = fixture(); await f.run();
  const manifest = JSON.parse(f.files.get('manifest.json'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(manifest).sort(), schema.required.toSorted());
  assert.equal(manifest.schemaVersion, schema.properties.schemaVersion.const);
  assert.equal(manifest.scope, schema.properties.scope.const);
  for (const field of Object.keys(manifest)) assert(field in schema.properties);
  const artifact = manifest.artifacts[0], shape = schema.properties.artifacts.items;
  assert.deepEqual(Object.keys(artifact).sort(), shape.required.toSorted());
  assertArtifact(artifact);
});
test('actual CLI default validates only with zero adapter activity', () => {
  const cli = fileURLToPath(new URL('./backup-job.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli], {
    env: {NODE_ENV: 'test', PATH: '/intentionally-no-tools', AWS_ACCESS_KEY_ID: fakeSecret,
      AWS_SECRET_ACCESS_KEY: fakeSecret, AWS_BACKUP_BUCKET: 'synthetic-never-contact'},
    encoding: 'utf8',
  });
  assert.equal(result.status, 2); // Configuration incomplete, without probing any tool.
  assert.equal(result.stderr, '');
  const records = result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).status, 'VALIDATION_ONLY');
  assert.equal(records.at(-1).providerCalls, 0);
  assert(!result.stdout.includes(fakeSecret));
});
test('actual CLI execution with a production source in test mode is blocked before tools', () => {
  const cli = fileURLToPath(new URL('./backup-job.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, ...flags], {
    env: {...env, PATH: '/intentionally-no-tools', B2_BACKUP_SOURCE_CLASS: 'production'},
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert(result.stdout.includes('TEST_SOURCE_DENIED'));
  assert(!result.stdout.includes('TOOL_UNAVAILABLE'));
  assert(!result.stdout.includes(fakeSecret));
});
test('both flags are required even when the environment claims execution approval', () => {
  assert.equal(executionMode([]), 'dry-run');
  assert.equal(executionMode(flags), 'execute');
});
