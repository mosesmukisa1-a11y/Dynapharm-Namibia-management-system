// Real adapter: loaded only after both CLI flags and configuration/source gates.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {BackupJobError, assertArtifact, executionMode, inTestRuntime, retainedUntil, validateConfig} from './backup-job.mjs';
import {
  WITH_OBJECTS, assertObjectAcknowledgement, validateObjectManifest, assertManifestFresh, objectArtifactName,
} from './backup-object-manifest.mjs';
import {SYSTEM_CA, validateSystemCA, validateLocalConfiguration} from './backup-local-validation.mjs';
import {POSTGRES_BOUNDS, postgresOptions} from './backup-postgres-bounds.mjs';
import {runBoundedLogicalDump, probeDumpSupervisor} from './backup-bounded-dump.mjs';
import {createDumpMonitor} from './backup-dump-monitor.mjs';
import {
  ENCRYPTION, createCiphertextRun, attachRunKey, encryptToOwnedFile,
  decryptOwnedFile, verifyCiphertext, cleanupCiphertextRun,
} from './backup-ciphertext.mjs';

function fail(code) { throw new BackupJobError(code); }
function command(executable, args, env, code, capture = false, input, allowEarlyClose = false) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable, args, {env, shell: false, stdio: [input ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore', 'pipe']}); }
    catch { reject(new BackupJobError(code)); return; }
    let text = '', exceeded = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 900_000);
    child.stderr.resume(); // Drain; never print, buffer, persist or attach raw stderr.
    let inputFailure = false;
    const supplied = input ? pipeline(Readable.from(input), child.stdin).catch(error => {
      if (allowEarlyClose && error.code === 'EPIPE') return;
      inputFailure = true; child.kill('SIGKILL');
    }) : Promise.resolve();
    child.stdout?.on('data', bytes => {
      if (Buffer.byteLength(text) + bytes.length > 65_536) { exceeded = true; child.kill('SIGKILL'); }
      else text += bytes.toString('utf8');
    });
    child.on('error', () => { clearTimeout(timer); reject(new BackupJobError(code)); });
    child.on('close', async (status, signal) => {
      clearTimeout(timer);
      await supplied;
      if (status !== 0 || signal || exceeded || timedOut || inputFailure) reject(new BackupJobError(code));
      else resolve(text);
    });
  });
}
export function toolEnvironment(env) {
  // Deliberately omit ambient endpoints, profiles, PG services/options and preload variables.
  return {PATH: env.PATH || '/usr/bin:/bin', LC_ALL: 'C'};
}
export function postgresEnvironment(env, source) {
  // Fixed launch settings, never ambient/URL PGOPTIONS. Freeze to prevent a
  // caller accidentally widening them after validation. pg_dump itself resets
  // server timeouts; the external process deadline remains mandatory.
  return Object.freeze({
    ...toolEnvironment(env), PGHOST: source.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: source.port || '5432', PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
    PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: env.B2_BACKUP_SOURCE_CLASS === 'production' ? 'verify-full' : source.searchParams.get('sslmode'),
    ...(env.B2_BACKUP_SOURCE_CLASS === 'production' ?
      {PGSSLROOTCERT: env.B2_BACKUP_PG_ROOT_CERT || SYSTEM_CA} : {}),
    PGCONNECT_TIMEOUT: String(POSTGRES_BOUNDS.connectMs / 1000), PGAPPNAME: 'b2-owner-backup',
    PGOPTIONS: postgresOptions(),
  });
}
function awsEnvironment(env) {
  return {
    ...toolEnvironment(env), AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN ? {AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN} : {}),
    AWS_REGION: env.AWS_REGION, AWS_DEFAULT_REGION: env.AWS_REGION,
    AWS_EC2_METADATA_DISABLED: 'true', AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null', AWS_PAGER: '',
    AWS_CLI_AUTO_PROMPT: 'off', AWS_MAX_ATTEMPTS: '1',
  };
}
async function aws(config, args, code) {
  try {
    const text = await command('aws', ['s3api', ...args, '--output', 'json', '--no-cli-pager'],
      awsEnvironment(config.env), code, true);
    return text.trim() ? JSON.parse(text) : {};
  } catch { fail(code); }
}
async function inspectFile(run, name) {
  let file;
  try {
    file = await fs.open(path.join(run.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size <= 0 || before.size > 5_000_000_000) fail('ARTIFACT_INVALID');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of file.createReadStream({autoClose: false})) { hash.update(chunk); bytes += chunk.length; }
    const after = await file.stat();
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs || after.ino !== before.ino) fail('ARTIFACT_INVALID');
    return {bytes, sha256: hash.digest('hex')};
  } catch { fail('ARTIFACT_INVALID'); }
  finally { await file?.close(); }
}

export function assertDestination(version, lock) {
  const retention = lock.ObjectLockConfiguration?.Rule?.DefaultRetention;
  if (version.Status !== 'Enabled' || lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled' ||
      retention?.Mode !== 'GOVERNANCE' || retention.Days !== 30 || retention.Years !== undefined) fail('PROVIDER_PREFLIGHT_FAILED');
}
export function assertRemoteArtifact(head, put, expected, kmsArn) {
  assertArtifact(expected);
  const expiry = Date.parse(head.ObjectLockRetainUntilDate);
  const created = Date.parse(head.LastModified);
  if (typeof put.VersionId !== 'string' || !put.VersionId || put.VersionId === 'null' ||
      head.VersionId !== put.VersionId || head.ContentLength !== expected.bytes ||
      head.ChecksumSHA256 !== Buffer.from(expected.sha256, 'hex').toString('base64') ||
      head.ServerSideEncryption !== 'aws:kms' || head.SSEKMSKeyId !== kmsArn ||
      head.ObjectLockMode !== 'GOVERNANCE' || !Number.isFinite(expiry) ||
      !Number.isFinite(created) || expiry - created < 30 * 86_400_000) fail('PROVIDER_VERIFY_FAILED');
}
export function assertSourcePreflight(row) {
  if (!row || row.readOnly !== true || row.inRecovery !== true || row.identityMatches !== true) {
    fail('SOURCE_PREFLIGHT_FAILED');
  }
}
async function wrapKey(config, key) {
  try {
    // Binary plaintext key travels through stdin only, never CLI arguments or a file.
    const text = await command('aws', ['kms', 'encrypt',
      '--key-id', config.env.B2_BACKUP_KMS_KEY_ARN, '--plaintext', 'fileb:///dev/stdin',
      '--output', 'json', '--no-cli-pager'], awsEnvironment(config.env), 'KEY_WRAP_FAILED', true, [key]);
    const result = JSON.parse(text);
    if (result.KeyId !== config.env.B2_BACKUP_KMS_KEY_ARN || typeof result.CiphertextBlob !== 'string') fail('KEY_WRAP_FAILED');
    return result.CiphertextBlob;
  } catch { fail('KEY_WRAP_FAILED'); }
}
async function streamDump(config, run) {
  // No provider-supported direct recovery binding has yet been established.
  // Labels, database-name equality and a workspace URL cannot enable production.
  if (config.env.B2_BACKUP_SOURCE_CLASS === 'production') fail('SOURCE_BINDING_UNVERIFIED');
  let client;
  try {
    await validateSystemCA(config.env.B2_BACKUP_PG_ROOT_CERT || SYSTEM_CA);
    const {Client} = await import('pg');
    client = new Client({
      host: config.source.hostname.replace(/^\[|\]$/g, ''), port: Number(config.source.port || 5432),
      user: decodeURIComponent(config.source.username), password: decodeURIComponent(config.source.password),
      database: decodeURIComponent(config.source.pathname.slice(1)),
      ssl: {rejectUnauthorized: true, ca: await fs.readFile(SYSTEM_CA, 'utf8')},
      connectionTimeoutMillis: 10_000, query_timeout: 1_000,
      options: '-c default_transaction_read_only=on -c statement_timeout=750 -c lock_timeout=500',
    });
    await client.connect();
    const row = (await client.query(`SELECT current_setting('transaction_read_only') = 'on' AS "readOnly",
      pg_is_in_recovery() AS "inRecovery", current_database() = $1 AS "identityMatches"`,
    [decodeURIComponent(config.source.pathname.slice(1))])).rows[0];
    assertSourcePreflight(row);
    const monitor = createDumpMonitor(client);
    client = null; // Bounded runner owns the reserved monitor from this point.
    return await runBoundedLogicalDump({run, env: postgresEnvironment(config.env, config.source), monitor});
  } catch (error) { fail(error instanceof BackupJobError ? error.code : 'SOURCE_PREFLIGHT_FAILED'); }
  finally { if (client) { client.connection?.stream?.destroy(); await client.end().catch(() => {}); } }
}
export function createBackupIO({args = [], env = {}, objectManifestJson} = {}) {
  const mode = executionMode(args);
  if (mode !== 'execute') fail('MISSING_OWNER_FLAG');
  assertObjectAcknowledgement(args, mode);
  const supplied = objectManifestJson ?? env.B2_BACKUP_OBJECT_MANIFEST_JSON;
  if (!args.includes(WITH_OBJECTS) && supplied !== undefined) fail('MANIFEST_MODE_REQUIRED');
  const approved = args.includes(WITH_OBJECTS) ? validateObjectManifest(supplied, env) : null;
  // Real adapter is never usable in node:test/Vitest/test mode, even for loopback.
  if (inTestRuntime(env)) fail('TEST_IO_DENIED');
  if (validateConfig(env).invalidFields.length) fail('CONFIG_INVALID');
  let storageClient;
  return {
    encryption: ENCRYPTION,
    async validateTools(config) {
      try {
        // A private binding must be reviewed before tools/provider/source calls.
        if (config.env.B2_BACKUP_SOURCE_CLASS === 'production') fail('SOURCE_BINDING_UNVERIFIED');
        await probeDumpSupervisor(toolEnvironment(config.env));
        await validateLocalConfiguration(config.env);
        const env = toolEnvironment(config.env);
        const dump = await command('pg_dump', ['--version'], env, 'TOOL_UNAVAILABLE', true);
        const restore = await command('pg_restore', ['--version'], env, 'TOOL_UNAVAILABLE', true);
        const cli = await command('aws', ['--version'], env, 'TOOL_UNAVAILABLE', true);
        const major = dump.match(/PostgreSQL\)\s+(\d+)/)?.[1];
        if (!major || restore.match(/PostgreSQL\)\s+(\d+)/)?.[1] !== major || !/^aws-cli\/2\./.test(cli)) fail('TOOL_INCOMPATIBLE');
        // Offline CLI capability probe: never contacts AWS.
        const skeleton = JSON.parse(await command('aws',
          ['s3api', 'put-object', '--generate-cli-skeleton', 'input'],
          awsEnvironment(config.env), 'TOOL_INCOMPATIBLE', true));
        for (const field of ['IfNoneMatch', 'ObjectLockMode', 'ObjectLockRetainUntilDate', 'ChecksumSHA256', 'SSEKMSKeyId']) {
          if (!(field in skeleton)) fail('TOOL_INCOMPATIBLE');
        }
      } catch (error) { fail(error instanceof BackupJobError ? error.code : 'TOOL_UNAVAILABLE'); }
    },
    async validateSource(config) {
      // No application rows. Fail closed on a non-replica/writable/mismatched source.
      // The source name is compared inside PostgreSQL; only booleans return to this code.
      let client;
      try {
        if (config.env.B2_BACKUP_SOURCE_CLASS === 'production') fail('SOURCE_BINDING_UNVERIFIED');
        await validateSystemCA(config.env.B2_BACKUP_PG_ROOT_CERT || SYSTEM_CA);
        const {Client} = await import('pg');
        client = new Client({
          host: config.source.hostname.replace(/^\[|\]$/g, ''), port: Number(config.source.port || 5432),
          user: decodeURIComponent(config.source.username), password: decodeURIComponent(config.source.password),
          database: decodeURIComponent(config.source.pathname.slice(1)),
          ssl: {rejectUnauthorized: true, ca: await fs.readFile(SYSTEM_CA, 'utf8')},
          connectionTimeoutMillis: POSTGRES_BOUNDS.connectMs, query_timeout: POSTGRES_BOUNDS.preflightMs,
          options: postgresOptions({preflight: true}),
        });
        await client.connect();
        await client.query('BEGIN READ ONLY');
        const result = await client.query(
          `SELECT current_setting('transaction_read_only') = 'on' AS "readOnly",
           pg_is_in_recovery() AS "inRecovery", current_database() = $1 AS "identityMatches"`,
          [decodeURIComponent(config.source.pathname.slice(1))]);
        assertSourcePreflight(result.rows[0]);
        await client.query('ROLLBACK');
      } catch (error) { fail(error instanceof BackupJobError ? error.code : 'SOURCE_PREFLIGHT_FAILED'); }
      finally { try { await client?.end(); } catch { /* No raw errors. */ } }
    },
    async validateDestination(config) {
      const args = ['--bucket', config.env.AWS_BACKUP_BUCKET];
      const version = await aws(config, ['get-bucket-versioning', ...args], 'PROVIDER_PREFLIGHT_FAILED');
      const lock = await aws(config, ['get-object-lock-configuration', ...args], 'PROVIDER_PREFLIGHT_FAILED');
      assertDestination(version, lock);
    },
    async createRun(config) {
      let run, key;
      try {
        run = await createCiphertextRun(config.env.B2_BACKUP_OUTPUT_DIR, config.runId);
        key = randomBytes(32);
        const wrapped = await wrapKey(config, key);
        attachRunKey(run, key, wrapped);
        return run;
      } catch (error) {
        key?.fill(0);
        if (run) await cleanupCiphertextRun(run);
        fail(error instanceof BackupJobError ? error.code : 'OUTPUT_UNSAFE');
      }
    },
    async dump(config, run) {
      await streamDump(config, run);
    },
    async validateArchive(config, run) {
      try {
        await verifyCiphertext(run, 'database.dump'); // authenticate entire envelope before consuming
        let header = Buffer.alloc(0);
        for await (const body of decryptOwnedFile(run, 'database.dump')) {
          if (header.length < 5) header = Buffer.concat([header, body.subarray(0, 5 - header.length)]);
        }
        if (header.toString() !== 'PGDMP') fail('ARCHIVE_INVALID');
        const env = toolEnvironment(config.env); // No DB credentials; restore commands have no --dbname.
        await command('pg_restore', ['--list'], env, 'ARCHIVE_INVALID', false, decryptOwnedFile(run, 'database.dump'), true);
        await command('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--file=/dev/null'],
          env, 'ARCHIVE_INVALID', false, decryptOwnedFile(run, 'database.dump'));
      } catch { fail('ARCHIVE_INVALID'); }
    },
    inspect: inspectFile,
    async captureObject(_config, run, index) {
      if (!approved) fail('MANIFEST_MODE_REQUIRED');
      assertManifestFresh(approved.manifest);
      if (!Number.isInteger(index) || index < 0 || index >= approved.objectCount) fail('MANIFEST_INVALID');
      const expected = approved.manifest.objects[index];
      const name = objectArtifactName(index);
      let stream, timer;
      try {
        if (!storageClient) {
          const {Client} = await import('@replit/object-storage');
          // Explicit authorized bucket only: no default bucket and no discovery/list operation.
          storageClient = new Client({bucketId: approved.manifest.source.bucketId});
        }
        assertManifestFresh(approved.manifest);
        assertManifestFresh(approved.manifest);
        const remaining = Date.parse(approved.manifest.authorization.expiresAtUtc) - Date.now();
        if (remaining <= 0) fail('MANIFEST_EXPIRED');
        stream = storageClient.downloadAsStream(expected.key, {decompress: false});
        const timeoutCode = remaining <= 600_000 ? 'MANIFEST_EXPIRED' : 'SOURCE_OBJECT_READ_FAILED';
        timer = setTimeout(() => stream.destroy(new BackupJobError(timeoutCode)), Math.min(600_000, remaining));
        timer.unref();
        async function* guarded() {
          for await (const chunk of stream) { assertManifestFresh(approved.manifest); yield chunk; }
        }
        const meta = await encryptToOwnedFile(run, name, guarded(), {
          expected: {bytes: expected.bytes, sha256: expected.sourceIdentity.sha256}, maximum: expected.bytes,
        });
        assertManifestFresh(approved.manifest);
        await verifyCiphertext(run, name, {bytes: expected.bytes, sha256: expected.sourceIdentity.sha256});
        return meta;
      } catch (error) {
        fail(error instanceof BackupJobError ? error.code : 'SOURCE_OBJECT_READ_FAILED');
      } finally {
        clearTimeout(timer);
        stream?.destroy();
      }
    },
    async write(run, name, contents) {
      const meta = await encryptToOwnedFile(run, name, [Buffer.from(contents)]);
      await verifyCiphertext(run, name);
      return meta;
    },
    async upload(config, run, name, expected) {
      assertArtifact(expected);
      await verifyCiphertext(run, name);
      const current = await inspectFile(run, name);
      if (current.bytes !== expected.bytes || current.sha256 !== expected.sha256) fail('ARTIFACT_INVALID');
      const checksum = Buffer.from(expected.sha256, 'hex').toString('base64');
      const key = `${config.prefix}/${name}`;
      const retainUntilUtc = retainedUntil(new Date());
      const put = await aws(config, ['put-object', '--bucket', config.env.AWS_BACKUP_BUCKET,
        '--key', key, '--body', path.join(run.directory, name), '--if-none-match', '*',
        '--server-side-encryption', 'aws:kms', '--ssekms-key-id', config.env.B2_BACKUP_KMS_KEY_ARN,
        '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum,
        '--object-lock-mode', 'GOVERNANCE', '--object-lock-retain-until-date', retainUntilUtc], 'PROVIDER_UPLOAD_FAILED');
      if (typeof put.VersionId !== 'string' || !put.VersionId || put.VersionId === 'null') fail('PROVIDER_VERIFY_FAILED');
      const head = await aws(config, ['head-object', '--bucket', config.env.AWS_BACKUP_BUCKET,
        '--key', key, '--version-id', put.VersionId, '--checksum-mode', 'ENABLED'], 'PROVIDER_VERIFY_FAILED');
      assertRemoteArtifact(head, put, expected, config.env.B2_BACKUP_KMS_KEY_ARN);
      return {versionId: put.VersionId, retainUntilUtc: new Date(head.ObjectLockRetainUntilDate).toISOString()};
    },
    cleanup: cleanupCiphertextRun,
  };
}
