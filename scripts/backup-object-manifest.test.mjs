// All operational stages are memory fakes. No SDK, DB, external tool or upload.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ACKNOWLEDGE, EXECUTE, runBackup, sha256, BackupJobError, retainedUntil} from './lib/backup-job.mjs';
import {createBackupIO, assertRemoteArtifact} from './lib/backup-job-io.mjs';
import {
  ACK_OBJECTS, WITH_OBJECTS, OBJECT_LIMITS, UPLOAD_COLUMNS,
  validateObjectManifest, objectArtifactName,
} from './lib/backup-object-manifest.mjs';

const id = '01234567-89ab-4cde-8f01-23456789abcd';
const owner = '0123456789abcdef0123456789abcdef';
const bucket = 'synthetic-never-contact';
const bucketPin = sha256(`replit_app_storage:${bucket}`);
const dbPin = sha256('synthetic-database-identity');
const kms = 'arn:aws:kms:eu-west-1:000000000000:key/01234567-89ab-4cde-8f01-23456789abcd';
const flags = [EXECUTE, ACKNOWLEDGE, WITH_OBJECTS, ACK_OBJECTS];
const now = new Date();
function manifest() {
  return {
    schemaVersion: 1, backupSetId: id,
    authorization: {authorizationId: id, issuedAtUtc: new Date(now - 120_000).toISOString(),
      expiresAtUtc: new Date(now.getTime() + 3_600_000).toISOString(), scope: 'EXACT_OBJECT_READS_NO_LIST_NO_BUSINESS_ROWS'},
    source: {provider: 'replit_app_storage', bucketId: bucket, bucketIdentitySha256: bucketPin,
      databaseIdentityFingerprint: dbPin, referenceSnapshotSha256: sha256('synthetic-reference-snapshot'),
      capturedAtUtc: new Date(now - 60_000).toISOString(), representation: 'stored-bytes-no-decompression'},
    objects: [
      {key: 'public/uploads/synthetic.bin', bytes: 3, sourceIdentity: {scheme: 'content-sha256', sha256: sha256('abc')},
        references: ['file_uploads.file_url', 'distributors.photo_url']},
      {key: 'staff-documents/synthetic.bin', bytes: 4, sourceIdentity: {scheme: 'content-sha256', sha256: sha256('abcd')},
        references: ['staff_documents.file_url']},
      {key: 'client-history-private/synthetic/attachment.bin', bytes: 5,
        sourceIdentity: {scheme: 'content-sha256', sha256: sha256('abcde')},
        references: ['client_history_attachments.object_name']},
    ],
  };
}
function config(text) {
  return {
    NODE_ENV: 'test', B2_BACKUP_SOURCE_CLASS: 'isolated', B2_BACKUP_TEST_OWNER: owner,
    B2_BACKUP_DATABASE_URL: `postgresql://synthetic:SYNTHETIC_PRIVATE@127.0.0.1:65432/b2_backup_test_${owner}?sslmode=disable`,
    B2_BACKUP_OUTPUT_DIR: '/synthetic-private', AWS_ACCESS_KEY_ID: 'SYNTHETIC_PRIVATE',
    AWS_SECRET_ACCESS_KEY: 'SYNTHETIC_PRIVATE', AWS_BACKUP_BUCKET: 'synthetic-never-contact',
    AWS_REGION: 'eu-west-1', B2_BACKUP_KMS_KEY_ARN: kms, B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED: 'true',
    B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED: 'true',
    B2_BACKUP_OBJECT_MANIFEST_SHA256: sha256(text),
    B2_BACKUP_APP_STORAGE_BUCKET_SHA256: bucketPin, B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT: dbPin,
  };
}
function fixture({mutate, raw, envPatch, failUpload, mismatch, badRetention, expireAfterCapture, readError} = {}) {
  const input = manifest(); mutate?.(input);
  const text = raw ? raw(input) : JSON.stringify(input);
  const env = {...config(text), ...envPatch}, calls = [], logs = [], writes = new Map(), uploads = [];
  let clock = now;
  const io = {
    async validateTools() { calls.push('tools'); },
    async validateDestination() { calls.push('destination'); },
    async createRun() { calls.push('staging'); return {directory: '/synthetic-private'}; },
    async dump() { calls.push('dump'); },
    async validateArchive() { calls.push('archive'); },
    async inspect() { return {bytes: 12, sha256: sha256('synthetic-db')}; },
    async captureObject(_config, _run, index) {
      calls.push(`capture:${index}`);
      if (readError) throw new Error(`${text}\nSYNTHETIC_PRIVATE\n${env.B2_BACKUP_DATABASE_URL}`);
      if (expireAfterCapture) clock = new Date(now.getTime() + 7_200_000);
      const entry = input.objects[index];
      return {bytes: mismatch === 'size' ? 0 : entry.bytes,
        sha256: mismatch === 'checksum' ? sha256('wrong') : entry.sourceIdentity.sha256};
    },
    async write(_run, name, data) {
      calls.push(`write:${name}`); writes.set(name, data);
      return {bytes: Buffer.byteLength(data), sha256: sha256(data)};
    },
    async upload(_config, _run, name, meta) {
      calls.push(`upload:${name}`); uploads.push(name);
      if (name === failUpload) throw new BackupJobError('PROVIDER_UPLOAD_FAILED');
      const put = {VersionId: `synthetic-${name}`};
      const expiry = badRetention && name.startsWith('object-') ? now.toISOString() : retainedUntil(now);
      assertRemoteArtifact({
        VersionId: put.VersionId, ContentLength: meta.bytes, ChecksumSHA256: Buffer.from(meta.sha256, 'hex').toString('base64'),
        ServerSideEncryption: 'aws:kms', SSEKMSKeyId: kms, ObjectLockMode: 'GOVERNANCE',
        LastModified: now.toISOString(), ObjectLockRetainUntilDate: expiry,
      }, put, meta, kms);
      return {versionId: put.VersionId, retainUntilUtc: expiry};
    },
  };
  return {
    text, env, input, calls, logs, writes, uploads,
    run: (overrides = {}) => runBackup({
      args: flags, env, objectManifestJson: text, now: () => clock, uuid: () => id,
      emit: value => logs.push(value),
      loadIO: async context => {
        calls.push('loadIO');
        assert.equal(context.objectManifestJson, text);
        return io;
      }, ...overrides,
    }),
  };
}

for (const args of [[WITH_OBJECTS], ['--dry-run', WITH_OBJECTS]]) test('manifest validation dry-run has zero calls', async () => {
  const f = fixture(), result = await f.run({args});
  assert.equal(result.status, 'VALIDATION_ONLY');
  assert.equal(result.objectManifest.objectCount, 3);
  assert.equal(result.objectManifest.totalBytes, 12);
  assert.deepEqual(f.calls, []);
  assert.deepEqual([result.databaseCalls, result.storageCalls, result.providerCalls], [0, 0, 0]);
});
test('supplied manifests cannot silently enable or bypass object mode', async () => {
  const f = fixture(), result = await f.run({args: []});
  assert.equal(result.code, 'MANIFEST_MODE_REQUIRED');
  assert.deepEqual(f.calls, []);
});
test('missing new acknowledgement fails before all IO', async () => {
  const f = fixture(), result = await f.run({args: [EXECUTE, ACKNOWLEDGE, WITH_OBJECTS]});
  assert.equal(result.code, 'MISSING_MANIFEST_ACKNOWLEDGEMENT');
  assert.deepEqual(f.calls, []);
});
for (const args of [[WITH_OBJECTS, ACK_OBJECTS], [EXECUTE, WITH_OBJECTS, ACK_OBJECTS],
  [ACKNOWLEDGE, WITH_OBJECTS, ACK_OBJECTS]]) test('new acknowledgement cannot replace either old gate', async () => {
  const f = fixture(), result = await f.run({args});
  assert.equal(result.status, 'FAILED'); assert.deepEqual(f.calls, []);
});
test('operational adapter independently enforces new acknowledgement and validates before SDK loading', () => {
  const f = fixture();
  assert.throws(() => createBackupIO({args: [EXECUTE, ACKNOWLEDGE, WITH_OBJECTS], env: f.env, objectManifestJson: f.text}),
    {code: 'MISSING_MANIFEST_ACKNOWLEDGEMENT'});
  assert.throws(() => createBackupIO({args: flags, env: f.env, objectManifestJson: '{}'}), {code: 'MANIFEST_INVALID'});
  assert.throws(() => createBackupIO({args: flags, env: f.env, objectManifestJson: f.text}), {code: 'TEST_IO_DENIED'});
});
const invalidCases = [
  ['unknown property', m => { m.extra = 'private'; }],
  ['unknown column', m => { m.objects[0].references = ['users.password_hash']; }],
  ['column/prefix mismatch', m => { m.objects[1].references = ['file_uploads.file_url']; }],
  ['duplicate key', m => { m.objects.push(structuredClone(m.objects[0])); }],
  ['duplicate reference', m => { m.objects[0].references.push(m.objects[0].references[0]); }],
  ['traversal', m => { m.objects[0].key = 'public/uploads/../private'; }],
  ['double-encoded traversal', m => { m.objects[0].key = 'public/uploads/%252e%252e/private'; }],
  ['empty path segment', m => { m.objects[0].key = 'public/uploads//private'; }],
  ['leading slash', m => { m.objects[0].key = '/public/uploads/private'; }],
  ['backslash', m => { m.objects[0].key = 'public/uploads/a\\b'; }],
  ['URL', m => { m.objects[0].key = 'https://synthetic.invalid/private'; }],
  ['query fragment', m => { m.objects[0].key = 'public/uploads/private?token=synthetic'; }],
  ['disallowed prefix', m => { m.objects[0].key = 'private/unknown'; }],
  ['unicode ambiguity', m => { m.objects[0].key = 'public/uploads/synthetíc'; }],
  ['empty object', m => { m.objects[0].bytes = 0; }],
  ['object size limit', m => { m.objects[0].bytes = OBJECT_LIMITS.perObjectBytes + 1; }],
  ['fractional size', m => { m.objects[0].bytes = 1.2; }],
  ['object count limit', m => { m.objects = Array.from({length: OBJECT_LIMITS.count + 1}, (_, i) =>
    ({...m.objects[0], key: `public/uploads/synthetic-${i}`})); }],
  ['total size limit', m => { m.objects = Array.from({length: 9}, (_, i) =>
    ({...m.objects[0], bytes: OBJECT_LIMITS.perObjectBytes, key: `public/uploads/synthetic-${i}`})); }],
  ['empty scope', m => { m.objects = []; }],
  ['unpinned identity', m => { m.objects[0].sourceIdentity = {scheme: 'latest', sha256: sha256('x')}; }],
  ['non-string checksum', m => { m.objects[0].sourceIdentity.sha256 = [sha256('x')]; }],
  ['non-string reference', m => { m.objects[0].references = [['file_uploads.file_url']]; }],
  ['non-string snapshot', m => { m.source.referenceSnapshotSha256 = [sha256('x')]; }],
  ['bucket binding changed', m => { m.source.bucketId = 'different-synthetic'; }],
  ['database binding changed', m => { m.source.databaseIdentityFingerprint = sha256('different'); }],
  ['future capture', m => { m.source.capturedAtUtc = new Date(now.getTime() + 30_000).toISOString(); }],
  ['scope broadened', m => { m.authorization.scope = 'LIST_EVERYTHING'; }],
  ['unbounded authority', m => { m.authorization.expiresAtUtc = new Date(now.getTime() + 2 * 86_400_000).toISOString(); }],
  ['no source metadata', m => { delete m.source; }],
];
for (const [label, mutate] of invalidCases) test(`invalid manifest before IO: ${label}`, async () => {
  const f = fixture({mutate}), result = await f.run();
  assert.equal(result.code, 'MANIFEST_INVALID'); assert.deepEqual(f.calls, []);
});
for (const raw of [
  () => '{"schemaVersion":',
  m => JSON.stringify(m).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
  m => JSON.stringify(m, null, 2),
  () => 'x'.repeat(OBJECT_LIMITS.manifestBytes + 1),
]) test('invalid wire representation never loads IO', async () => {
  const f = fixture({raw}), result = await f.run();
  assert.equal(result.code, 'MANIFEST_INVALID'); assert.deepEqual(f.calls, []);
});
test('expired authorization rejects before IO', async () => {
  const f = fixture({mutate: m => { m.authorization.expiresAtUtc = new Date(now - 10_000).toISOString(); }});
  assert.equal((await f.run()).code, 'MANIFEST_EXPIRED'); assert.deepEqual(f.calls, []);
});
for (const envPatch of [
  {B2_BACKUP_OBJECT_MANIFEST_SHA256: sha256('wrong')},
  {B2_BACKUP_APP_STORAGE_BUCKET_SHA256: sha256('wrong')},
  {B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT: sha256('wrong')},
]) test('independent identity pins are mandatory before IO', async () => {
  const f = fixture({envPatch}), result = await f.run();
  assert.equal(result.code, 'MANIFEST_INVALID'); assert.deepEqual(f.calls, []);
});
test('parsed manifest and nested source identities are immutable', () => {
  const f = fixture(), approved = validateObjectManifest(f.text, f.env, now);
  assert(Object.isFrozen(approved)); assert(Object.isFrozen(approved.manifest.source));
  assert(Object.isFrozen(approved.manifest.objects[0].sourceIdentity));
  assert.throws(() => { approved.manifest.objects[0].key = 'private/changed'; }, TypeError);
});
test('linked backup set verifies all captures and uploads completion last', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.status, 'COMPLETE_MANIFEST_BACKUP_SET'); assert.equal(result.fullB2Recovery, false);
  assert.deepEqual(f.uploads, ['database.dump', 'object-000001.bin', 'object-000002.bin',
    'object-000003.bin', 'object-manifest.json', 'manifest.json', 'SHA256SUMS', 'COMPLETED.json']);
  assert(f.calls.indexOf('archive') < f.calls.indexOf('capture:0'));
  assert.equal(f.writes.get('object-manifest.json'), f.text);
  const output = JSON.parse(f.writes.get('manifest.json'));
  assert.equal(output.schemaVersion, 2);
  assert.equal(output.backupSet.objectManifestSha256, sha256(f.text));
  assert.equal(output.backupSet.databaseArtifactSha256, output.artifacts[0].sha256);
  assert.equal(output.backupSet.objectCount, 3); assert.equal(output.objects.length, 3);
  assert.equal(output.backupSet.crossResourceAtomicity, false);
  assert.equal(output.backupSet.providerSnapshotVerified, false);
  for (let i = 0; i < 3; i++) assert(f.writes.get('SHA256SUMS').includes(
    `${f.input.objects[i].sourceIdentity.sha256}  ${objectArtifactName(i)}`));
  const complete = JSON.parse(f.writes.get('COMPLETED.json'));
  assert.equal(complete.objectManifestSha256, sha256(f.text));
  assert.equal(complete.manifestSha256, sha256(f.writes.get('manifest.json')));
});
for (const mismatch of ['size', 'checksum']) test(`source ${mismatch} mismatch prevents object upload/completion`, async () => {
  const f = fixture({mismatch}), result = await f.run();
  assert(['SOURCE_OBJECT_MISMATCH', 'ARTIFACT_INVALID'].includes(result.code));
  assert.deepEqual(f.uploads, ['database.dump']);
  assert(!f.writes.has('COMPLETED.json'));
});
test('partial second-object failure leaves no completion or deletion action', async () => {
  const f = fixture({failUpload: 'object-000002.bin'}), result = await f.run();
  assert.equal(result.code, 'PROVIDER_UPLOAD_FAILED');
  assert.deepEqual(f.uploads, ['database.dump', 'object-000001.bin', 'object-000002.bin']);
  assert(!f.writes.has('manifest.json')); assert(!f.writes.has('COMPLETED.json'));
  assert(!f.calls.some(call => /delete|bypass|cleanup/i.test(call)));
});
test('object retention failure prevents claiming completion', async () => {
  const f = fixture({badRetention: true}), result = await f.run();
  assert.equal(result.code, 'PROVIDER_VERIFY_FAILED'); assert(!f.writes.has('COMPLETED.json'));
});
test('authority expiry during capture prevents upload and completion', async () => {
  const f = fixture({expireAfterCapture: true}), result = await f.run();
  assert.equal(result.code, 'MANIFEST_EXPIRED'); assert.deepEqual(f.uploads, ['database.dump']);
});
test('private manifests/keys/pins/URLs never enter results or structured logs', async () => {
  const f = fixture(); const result = await f.run();
  const output = JSON.stringify([result, f.logs]);
  for (const value of ['SYNTHETIC_PRIVATE', f.env.B2_BACKUP_DATABASE_URL,
    f.input.objects[0].key, f.input.objects[1].key, f.input.objects[2].key, bucketPin, dbPin, f.text]) {
    assert(!output.includes(value));
  }
});
test('untrusted source-read errors cannot expose manifest contents or credentials', async () => {
  const f = fixture({readError: true}), result = await f.run();
  assert.equal(result.code, 'INTERNAL_FAILURE');
  const output = JSON.stringify([result, f.logs]);
  for (const value of [f.text, f.input.objects[0].key, 'SYNTHETIC_PRIVATE', f.env.B2_BACKUP_DATABASE_URL]) {
    assert(!output.includes(value));
  }
  assert(!f.writes.has('COMPLETED.json'));
});
test('object mode without a supplied manifest fails before IO', async () => {
  const f = fixture(), result = await f.run({objectManifestJson: undefined});
  assert.equal(result.code, 'MANIFEST_INVALID'); assert.deepEqual(f.calls, []);
});
test('manifest text supplied through environment stays validation-only without owner flags', async () => {
  const f = fixture(), result = await f.run({args: [WITH_OBJECTS],
    objectManifestJson: undefined, env: {...f.env, B2_BACKUP_OBJECT_MANIFEST_JSON: f.text}});
  assert.equal(result.status, 'VALIDATION_ONLY'); assert.deepEqual(f.calls, []);
});
test('published schema contracts and semantic allowlist match source implementation', async () => {
  const input = JSON.parse(await fs.readFile(new URL('../docs/schemas/b2-authorized-object-manifest.schema.json', import.meta.url)));
  const output = JSON.parse(await fs.readFile(new URL('../docs/schemas/b2-backup-set.schema.json', import.meta.url)));
  assert.deepEqual(input.properties.objects.items.properties.references.items.enum.toSorted(), Object.keys(UPLOAD_COLUMNS).toSorted());
  assert.equal(input.properties.objects.maxItems, OBJECT_LIMITS.count);
  const f = fixture(); await f.run();
  const stored = JSON.parse(f.writes.get('manifest.json'));
  assert.deepEqual(Object.keys(stored).sort(), output.required.toSorted());
  assert.deepEqual(Object.keys(stored.backupSet).sort(), output.properties.backupSet.required.toSorted());
});
test('operational source has only exact reads and retained conditional encrypted upload policy', async () => {
  const source = await fs.readFile(new URL('./lib/backup-job-io.mjs', import.meta.url), 'utf8');
  assert(source.includes('downloadAsStream(expected.key, {decompress: false})'));
  assert(source.includes("new Client({bucketId: approved.manifest.source.bucketId})"));
  assert(!/\.(?:list|listObjects|delete|remove)\s*\(/.test(source));
  for (const option of ['--if-none-match', '--checksum-sha256', '--server-side-encryption',
    '--ssekms-key-id', '--object-lock-mode', '--object-lock-retain-until-date', '--version-id']) {
    assert(source.includes(option));
  }
  assert(!source.includes('--bypass-governance-retention'));
});
