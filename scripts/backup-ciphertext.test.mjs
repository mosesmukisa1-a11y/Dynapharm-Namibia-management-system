import {syntheticCredential, syntheticCredentialUrl} from './lib/synthetic-credential-fixture.mjs';
// Offline only: deterministic synthetic source bytes, private disposable local ciphertext.
// No SDK, PostgreSQL client, native database tools, provider callbacks or business data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {
  createCiphertextRun, attachRunKey, encryptToOwnedFile, decryptOwnedFile,
  verifyCiphertext, cleanupCiphertextRun,
} from './lib/backup-ciphertext.mjs';
import {SYSTEM_CA, validateSystemCA, validateLocalConfiguration} from './lib/backup-local-validation.mjs';
import {runBackup, validateConfig, EXECUTE, ACKNOWLEDGE, BackupJobError} from './lib/backup-job.mjs';
import {assertSourcePreflight, postgresEnvironment} from './lib/backup-job-io.mjs';
import {objectArtifactName} from './lib/backup-object-manifest.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const secret = syntheticCredential("canary");
const owner = '0123456789abcdef0123456789abcdef';
const env = {
  NODE_ENV: 'test', B2_BACKUP_SOURCE_CLASS: 'isolated', B2_BACKUP_TEST_OWNER: owner,
  DATABASE_URL: syntheticCredentialUrl({local: true}),
  B2_BACKUP_OUTPUT_DIR: '/synthetic-private', AWS_ACCESS_KEY_ID: secret, AWS_SECRET_ACCESS_KEY: secret,
  AWS_BACKUP_BUCKET: 'synthetic-never-contact', AWS_REGION: 'eu-west-1',
  B2_BACKUP_KMS_KEY_ARN: 'arn:aws:kms:eu-west-1:000000000000:key/01234567-89ab-4cde-8f01-23456789abcd',
  B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED: 'true', B2_BACKUP_GOVERNANCE_NO_BYPASS_CONFIRMED: 'true',
};
const flags = [EXECUTE, ACKNOWLEDGE];
async function fixture(t) {
  const root = `/tmp/b2-ciphertext-${randomUUID()}`;
  await fs.mkdir(root, {mode: 0o700});
  // Only a newly generated, test-owned root. No production upload paths.
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const run = await createCiphertextRun(root, `20261018T123456789Z_${randomUUID()}`);
  const key = randomBytes(32);
  attachRunKey(run, key, Buffer.from('SYNTHETIC_WRAPPED_KEY_ONLY').toString('base64'));
  return {root, run, key};
}
async function restored(run, name) {
  const chunks = [];
  for await (const body of decryptOwnedFile(run, name)) chunks.push(body);
  return Buffer.concat(chunks);
}
test('protected DATABASE_URL fallback validates without copying or disclosing input', async () => {
  const logs = [];
  const result = await runBackup({env, emit: event => logs.push(event),
    loadIO: () => assert.fail('operational adapter loaded')});
  assert.equal(result.configurationValid, true);
  assert(!JSON.stringify([logs, result]).includes(secret));
  assert(!JSON.stringify([logs, result]).includes(env.DATABASE_URL));
  assert(!JSON.stringify([logs, result]).includes(digest(env.DATABASE_URL)));
  assert.equal(env.B2_BACKUP_DATABASE_URL, undefined);
});
test('explicit malformed override never falls back to ambient source', () => {
  for (const value of ['', 'invalid', 'postgresql://']) {
    assert(validateConfig({...env, B2_BACKUP_DATABASE_URL: value}).invalidFields.includes('B2_BACKUP_DATABASE_URL'));
  }
});
test('explicit dedicated protected source takes precedence', () => {
  const dedicated = env.DATABASE_URL.replace('synthetic:', 'dedicated:');
  assert.equal(validateConfig({...env, B2_BACKUP_DATABASE_URL: dedicated}).source.username, 'dedicated');
});
for (const sslmode of [null, 'disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']) {
  test(`production source always upgrades TLS mode ${sslmode} to verify-full`, () => {
    const source = new URL(syntheticCredentialUrl({local: false}));
    if (sslmode) source.searchParams.set('sslmode', sslmode);
    const pg = postgresEnvironment({...env, B2_BACKUP_SOURCE_CLASS: 'production'}, source);
    assert(!validateConfig({...env, B2_BACKUP_SOURCE_CLASS: 'production',
      DATABASE_URL: source.href}).invalidFields.includes('B2_BACKUP_DATABASE_URL'));
    assert.equal(pg.PGSSLMODE, 'verify-full');
    assert.equal(pg.PGSSLROOTCERT, SYSTEM_CA);
    assert(pg.PGOPTIONS.includes('default_transaction_read_only=on'));
  });
}
for (const sslmode of ['invalid', 'false', 'no-verify', '']) {
  test(`production unknown TLS mode ${sslmode} fails configuration`, () => {
    const result = validateConfig({...env, B2_BACKUP_SOURCE_CLASS: 'production',
      DATABASE_URL: syntheticCredentialUrl({local: false, sslmode})});
    assert(result.invalidFields.includes('B2_BACKUP_DATABASE_URL'));
  });
}
test('standard runtime system CA bundle is readable, parsable and CA-only', async () => {
  assert.equal((await validateSystemCA()).status, 'PASS');
});
for (const failure of ['missing', 'unreadable', 'writable', 'empty', 'malformed']) {
  test(`standard CA bundle ${failure} fails closed before provider IO`, async () => {
    const localFS = {
      async stat() {
        if (failure === 'missing') throw new Error(secret);
        return {isFile: () => true, size: 500, mode: failure === 'writable' ? 0o666 : 0o644};
      },
      async readFile() {
        if (failure === 'unreadable') throw new Error(secret);
        return failure === 'malformed' ? '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----' : '';
      },
    };
    await assert.rejects(validateSystemCA(SYSTEM_CA, localFS), error => {
      assert(!String(error).includes(secret)); return error.code === 'TLS_TRUST_INVALID';
    });
  });
}
for (const filename of ['/nonexistent/ca.pem', '-----BEGIN CERTIFICATE-----', '/dev/null', '/tmp/fake.pem']) {
  test('non-system/missing/certificate-content trust setting fails closed', async () => {
    await assert.rejects(validateSystemCA(filename), {code: 'TLS_TRUST_INVALID'});
  });
}
test('no filesystem-encryption assurance is accepted as ciphertext assurance', () => {
  assert(validateConfig({...env, B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED: undefined,
    B2_BACKUP_ENCRYPTED_OUTPUT_CONFIRMED: 'true'}).invalidFields.includes('B2_BACKUP_CIPHERTEXT_ONLY_CONFIRMED'));
});
test('source preflight requires all exact identity/read-only/recovery booleans', () => {
  const good = {readOnly: true, inRecovery: true, identityMatches: true};
  assert.doesNotThrow(() => assertSourcePreflight(good));
  for (const key of Object.keys(good)) assert.throws(() => assertSourcePreflight({...good, [key]: false}),
    {code: 'SOURCE_PREFLIGHT_FAILED'});
  assert.throws(() => assertSourcePreflight(), {code: 'SOURCE_PREFLIGHT_FAILED'});
});
test('validation mode with local checks makes zero provider/database/storage/adapter calls', async t => {
  const f = await fixture(t), logs = [];
  const result = await runBackup({env: {...env, B2_BACKUP_OUTPUT_DIR: f.root},
    validateLocal: validateLocalConfiguration, emit: event => logs.push(event),
    loadIO: () => assert.fail('provider adapter loaded')});
  assert.equal(result.status, 'VALIDATION_ONLY');
  assert.equal(result.localChecks.filesystemEncryptionClaimed, false);
  assert.deepEqual([result.providerCalls, result.databaseCalls, result.storageCalls], [0, 0, 0]);
  assert(!JSON.stringify([result, logs]).includes(secret));
  await cleanupCiphertextRun(f.run);
});
test('local trust failure in validation cannot reach operational adapter', async () => {
  const result = await runBackup({env, validateLocal: async () => { throw new BackupJobError('TLS_TRUST_INVALID'); },
    loadIO: () => assert.fail('provider adapter loaded')});
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'TLS_TRUST_INVALID');
});
test('production fallback source in tests is refused before adapter even with operational flags', async () => {
  const result = await runBackup({args: flags, env: {...env, B2_BACKUP_SOURCE_CLASS: 'production'},
    loadIO: () => assert.fail('provider adapter loaded')});
  assert.equal(result.code, 'TEST_SOURCE_DENIED');
});
test('every temporary write contains authenticated envelope/ciphertext, never source bytes', async t => {
  const {run, key} = await fixture(t);
  const plain = Buffer.from('SYNTHETIC_NON_SENSITIVE_PLAINTEXT_SENTINEL_'.repeat(1024));
  async function* source() {
    for (let i = 0; i < 4; i++) {
      if (i) {
        const disk = await fs.readFile(`${run.directory}/database.dump.partial`);
        assert.equal(disk.subarray(0, 8).toString(), 'B2GCM001');
        assert(!disk.includes(plain.subarray(0, 100)));
      }
      yield plain.subarray(i * plain.length / 4, (i + 1) * plain.length / 4);
    }
  }
  const meta = await encryptToOwnedFile(run, 'database.dump', source());
  assert.equal(meta.plaintextBytes, plain.length);
  assert.notEqual(meta.sha256, digest(plain));
  const disk = await fs.readFile(`${run.directory}/database.dump`);
  assert.equal(digest(disk), meta.sha256); assert(!disk.includes(plain));
  assert.equal((await verifyCiphertext(run, 'database.dump', {bytes: plain.length, sha256: digest(plain)})).authenticated, true);
  assert.deepEqual(await restored(run, 'database.dump'), plain);
  assert.deepEqual(await fs.readdir(run.directory), ['database.dump']);
  await cleanupCiphertextRun(run);
  assert(key.every(byte => byte === 0));
  await assert.rejects(fs.stat(run.directory), {code: 'ENOENT'});
});
for (const name of ['object-000000.bin', 'object-manifest.json', 'manifest.json', 'SHA256SUMS', 'COMPLETED.json']) {
  test(`all backup artifact kinds including ${name} use ciphertext envelope`, async t => {
    const {run} = await fixture(t), plain = Buffer.from('SYNTHETIC_CONTENT_NOT_A_LIVE_OBJECT');
    await encryptToOwnedFile(run, name, [plain], {expected: {bytes: plain.length, sha256: digest(plain)}});
    const disk = await fs.readFile(`${run.directory}/${name}`);
    assert.equal(disk.subarray(0, 8).toString(), 'B2GCM001');
    assert(!disk.includes(plain));
    await verifyCiphertext(run, name);
    await cleanupCiphertextRun(run);
  });
}
for (const offset of [0, 15, -1, -18]) test(`tampered envelope at offset ${offset} fails authentication`, async t => {
  const {run} = await fixture(t);
  await encryptToOwnedFile(run, 'database.dump', [Buffer.from('SYNTHETIC_ARCHIVE')]);
  const file = `${run.directory}/database.dump`, body = await fs.readFile(file);
  const index = offset < 0 ? body.length + offset : offset;
  body[index] ^= 1; await fs.writeFile(file, body);
  await assert.rejects(verifyCiphertext(run, 'database.dump'), {code: 'CIPHERTEXT_INVALID'});
  await cleanupCiphertextRun(run);
});
test('ciphertext source checksum/size mismatch and empty source refuse completion', async t => {
  for (const input of [[], [Buffer.from('wrong')]]) {
    const {run} = await fixture(t);
    await assert.rejects(encryptToOwnedFile(run, 'database.dump', input,
      {expected: {bytes: 9, sha256: digest('expected!')}}), {code: 'CIPHERTEXT_INVALID'});
    assert.deepEqual(await fs.readdir(run.directory), ['database.dump.partial']);
    await cleanupCiphertextRun(run);
  }
});
test('source-stream failure leaves ciphertext partial only and owned cleanup removes it', async t => {
  const {run} = await fixture(t);
  async function* broken() { yield Buffer.from('SYNTHETIC_CHUNK'); throw new Error(secret); }
  await assert.rejects(encryptToOwnedFile(run, 'database.dump', broken()), error => {
    assert(!String(error).includes(secret)); return error.code === 'CIPHERTEXT_INVALID';
  });
  assert(!(await fs.readFile(`${run.directory}/database.dump.partial`)).includes(Buffer.from('SYNTHETIC_CHUNK')));
  await cleanupCiphertextRun(run);
});
test('duplicate artifacts and traversal names fail without overwrite', async t => {
  const {run} = await fixture(t);
  await encryptToOwnedFile(run, 'database.dump', [Buffer.from('SYNTHETIC')]);
  for (const name of ['database.dump', '../other', '/tmp/foreign', 'database.dump/child']) {
    await assert.rejects(encryptToOwnedFile(run, name, [Buffer.from('OTHER')]), {code: 'CIPHERTEXT_INVALID'});
  }
  assert.equal((await restored(run, 'database.dump')).toString(), 'SYNTHETIC');
  await cleanupCiphertextRun(run);
});
test('unowned run cannot be encrypted, decrypted or cleaned', async () => {
  const run = {directory: '/tmp/not-owned'};
  await assert.rejects(encryptToOwnedFile(run, 'database.dump', [Buffer.from('SYNTHETIC')]), {code: 'CIPHERTEXT_INVALID'});
  await assert.rejects(verifyCiphertext(run, 'database.dump'), {code: 'CIPHERTEXT_INVALID'});
  await assert.rejects(cleanupCiphertextRun(run), {code: 'CIPHERTEXT_INVALID'});
});
test('cleanup refuses unrelated files and reports incomplete cleanup without recursive deletion', async t => {
  const {run, key} = await fixture(t);
  await encryptToOwnedFile(run, 'database.dump', [Buffer.from('SYNTHETIC')]);
  await fs.writeFile(`${run.directory}/foreign`, 'SYNTHETIC_FOREIGN');
  await assert.rejects(cleanupCiphertextRun(run), {code: 'CLEANUP_FAILED'});
  assert.equal(await fs.readFile(`${run.directory}/foreign`, 'utf8'), 'SYNTHETIC_FOREIGN');
  assert(key.every(byte => byte === 0));
});
test('cleanup refuses replaced file and preserves replacement', async t => {
  const {run} = await fixture(t);
  await encryptToOwnedFile(run, 'database.dump', [Buffer.from('SYNTHETIC')]);
  await fs.rename(`${run.directory}/database.dump`, `${run.directory}/owned-moved`);
  await fs.writeFile(`${run.directory}/database.dump`, 'SYNTHETIC_FOREIGN');
  await assert.rejects(cleanupCiphertextRun(run), {code: 'CLEANUP_FAILED'});
  assert.equal(await fs.readFile(`${run.directory}/database.dump`, 'utf8'), 'SYNTHETIC_FOREIGN');
});
test('root safety rejects served/project paths, symlinks and public permissions', async t => {
  const {root, run} = await fixture(t);
  await cleanupCiphertextRun(run);
  await fs.chmod(root, 0o755);
  await assert.rejects(createCiphertextRun(root, `20261018T123456789Z_${randomUUID()}`), {code: 'OUTPUT_UNSAFE'});
  await assert.rejects(createCiphertextRun(process.cwd(), `20261018T123456789Z_${randomUUID()}`), {code: 'OUTPUT_UNSAFE'});
});
for (const failed of [false, true]) test(`orchestrator cleans owned run on ${failed ? 'failure' : 'success'}`, async () => {
  const calls = [];
  const result = await runBackup({args: flags, env, loadIO: async () => ({
    async validateTools() {}, async validateDestination() {}, async createRun() { return {}; },
    async dump() { if (failed) throw new BackupJobError('DUMP_FAILED'); },
    async validateArchive() {}, async inspect() { return {bytes: 1, sha256: digest('x')}; },
    async write() { return {bytes: 1, sha256: digest('x')}; },
    async upload(_c, _r, name) { calls.push(name); return {versionId: 'synthetic'}; },
    async cleanup() { calls.push('cleanup'); },
  })});
  assert.equal(result.cleanup, 'PASS');
  assert.equal(calls.at(-1), 'cleanup');
  if (failed) assert(!calls.includes('COMPLETED.json'));
  else assert.equal(calls.at(-2), 'COMPLETED.json');
});
test('cleanup failure changes otherwise successful outcome to explicit sanitized failure', async () => {
  const result = await runBackup({args: flags, env, loadIO: async () => ({
    async validateTools() {}, async validateDestination() {}, async createRun() { return {}; },
    async dump() { throw new Error(secret); },
    async cleanup() { throw new Error(secret); },
  })});
  assert.equal(result.code, 'CLEANUP_FAILED'); assert.equal(result.cleanup, 'FAIL');
  assert(!JSON.stringify(result).includes(secret));
});
for (const withObjects of [false, true]) test(`orchestrator real local encryption, objects=${withObjects}, binds ciphertext checksums`, async t => {
  const root = `/tmp/b2-ciphertext-${randomUUID()}`;
  await fs.mkdir(root, {mode: 0o700});
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const uploads = new Map(), parsed = new Map(), calls = [];
  const objectBody = Buffer.from('SYNTHETIC_OBJECT_CONTENT');
  const clock = new Date();
  const manifestInput = {
    schemaVersion: 1, backupSetId: randomUUID(),
    authorization: {authorizationId: randomUUID(), issuedAtUtc: new Date(clock - 120000).toISOString(),
      expiresAtUtc: new Date(clock.getTime() + 3600000).toISOString(), scope: 'EXACT_OBJECT_READS_NO_LIST_NO_BUSINESS_ROWS'},
    source: {provider: 'replit_app_storage', bucketId: 'synthetic-never-contact',
      bucketIdentitySha256: digest('replit_app_storage:synthetic-never-contact'),
      databaseIdentityFingerprint: digest('synthetic-database-identity'),
      referenceSnapshotSha256: digest('synthetic-reference-snapshot'),
      capturedAtUtc: new Date(clock - 60000).toISOString(), representation: 'stored-bytes-no-decompression'},
    objects: [{key: 'public/uploads/synthetic.bin', bytes: objectBody.length,
      sourceIdentity: {scheme: 'content-sha256', sha256: digest(objectBody)}, references: ['file_uploads.file_url']}],
  };
  const manifestText = JSON.stringify(manifestInput);
  let active;
  const io = {
    encryption: {format: 'B2GCM001', algorithm: 'AES-256-GCM', keyWrapping: 'AWS-KMS', plaintextStaged: false},
    async validateTools() {}, async validateDestination() {},
    async validateSource() { calls.push('source-preflight'); },
    async createRun(config) {
      active = await createCiphertextRun(root, config.runId);
      attachRunKey(active, randomBytes(32), Buffer.from('SYNTHETIC_WRAPPED_KEY_ONLY').toString('base64'));
      return active;
    },
    async dump(_config, run) {
      calls.push('dump');
      await encryptToOwnedFile(run, 'database.dump', [Buffer.from('PGDMP_SYNTHETIC_NOT_A_NATIVE_ARCHIVE')]);
    },
    async validateArchive(_config, run) { await verifyCiphertext(run, 'database.dump'); },
    async captureObject(_config, run, index) {
      assert.equal(index, 0);
      return encryptToOwnedFile(run, objectArtifactName(index), [objectBody],
        {expected: {bytes: objectBody.length, sha256: digest(objectBody)}});
    },
    async inspect(run, name) {
      const body = await fs.readFile(`${run.directory}/${name}`);
      return {bytes: body.length, sha256: digest(body)};
    },
    async write(run, name, contents) {
      parsed.set(name, contents);
      return encryptToOwnedFile(run, name, [Buffer.from(contents)]);
    },
    async upload(_config, run, name, meta) {
      await verifyCiphertext(run, name);
      const body = await fs.readFile(`${run.directory}/${name}`);
      assert.equal(body.subarray(0, 8).toString(), 'B2GCM001');
      assert.equal(meta.sha256, digest(body)); assert.equal(meta.bytes, body.length);
      assert(!body.includes(Buffer.from('PGDMP_SYNTHETIC')));
      uploads.set(name, body);
      return {versionId: 'synthetic-version', retainUntilUtc: '2026-12-01T00:00:00Z'};
    },
    async cleanup(run) { await cleanupCiphertextRun(run); },
  };
  const result = await runBackup({
    args: withObjects ? [...flags, '--with-app-storage', '--acknowledge-authorized-object-manifest'] : flags,
    env: {...env, B2_BACKUP_OUTPUT_DIR: root,
      ...(withObjects ? {B2_BACKUP_OBJECT_MANIFEST_SHA256: digest(manifestText),
        B2_BACKUP_APP_STORAGE_BUCKET_SHA256: manifestInput.source.bucketIdentitySha256,
        B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT: manifestInput.source.databaseIdentityFingerprint} : {})},
    ...(withObjects ? {objectManifestJson: manifestText} : {}),
    loadIO: async () => io,
  });
  assert.equal(result.status, withObjects ? 'COMPLETE_MANIFEST_BACKUP_SET' : 'COMPLETE_DATABASE_BACKUP',
    JSON.stringify(result));
  assert.equal(result.cleanup, 'PASS');
  assert.deepEqual(calls, ['source-preflight', 'dump']);
  assert.deepEqual([...uploads.keys()], ['database.dump', ...(withObjects ? [objectArtifactName(0), 'object-manifest.json'] : []),
    'manifest.json', 'SHA256SUMS', 'COMPLETED.json']);
  const completed = JSON.parse(parsed.get('COMPLETED.json'));
  assert.equal(completed.manifestSha256, digest(uploads.get('manifest.json')));
  assert.equal(completed.checksumsSha256, digest(uploads.get('SHA256SUMS')));
  const manifest = JSON.parse(parsed.get('manifest.json'));
  assert.equal(manifest.encryption.plaintextStaged, false);
  assert.equal(manifest.artifacts[0].sha256, digest(uploads.get('database.dump')));
  if (withObjects) {
    assert.equal(manifest.backupSet.objectManifestSha256, digest(uploads.get('object-manifest.json')));
    assert.equal(completed.objectManifestSha256, digest(uploads.get('object-manifest.json')));
    assert.equal(manifest.backupSet.totalBytes, objectBody.length);
    assert.equal(manifest.objects[0].bytes, uploads.get(objectArtifactName(0)).length);
    assert(uploads.get(objectArtifactName(0)).length > objectBody.length);
    assert(!uploads.get('object-manifest.json').includes(Buffer.from('public/uploads/synthetic.bin')));
  }
  assert.deepEqual(await fs.readdir(root), []);
});
