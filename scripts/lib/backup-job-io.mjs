// Real adapter: loaded only after both CLI flags and configuration/source gates.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {BackupJobError, assertArtifact, executionMode, inTestRuntime, retainedUntil, validateConfig} from './backup-job.mjs';
import {
  WITH_OBJECTS, assertObjectAcknowledgement, validateObjectManifest, assertManifestFresh, objectArtifactName,
} from './backup-object-manifest.mjs';

function fail(code) { throw new BackupJobError(code); }
function command(executable, args, env, code, capture = false) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable, args, {env, shell: false, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe']}); }
    catch { reject(new BackupJobError(code)); return; }
    let text = '', exceeded = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 900_000);
    child.stderr.resume(); // Drain; never print, buffer, persist or attach raw stderr.
    child.stdout?.on('data', bytes => {
      if (Buffer.byteLength(text) + bytes.length > 65_536) { exceeded = true; child.kill('SIGKILL'); }
      else text += bytes.toString('utf8');
    });
    child.on('error', () => { clearTimeout(timer); reject(new BackupJobError(code)); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      if (status !== 0 || signal || exceeded || timedOut) reject(new BackupJobError(code));
      else resolve(text);
    });
  });
}
export function toolEnvironment(env) {
  // Deliberately omit ambient endpoints, profiles, PG services/options and preload variables.
  return {PATH: env.PATH || '/usr/bin:/bin', LC_ALL: 'C'};
}
export function postgresEnvironment(env, source) {
  return {
    ...toolEnvironment(env), PGHOST: source.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: source.port || '5432', PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
    PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: source.searchParams.get('sslmode'),
    ...(env.B2_BACKUP_PG_ROOT_CERT ? {PGSSLROOTCERT: env.B2_BACKUP_PG_ROOT_CERT} : {}),
    PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'b2-owner-backup',
    PGOPTIONS: '-c default_transaction_read_only=on -c lock_timeout=5000 -c statement_timeout=600000',
  };
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
    async validateTools(config) {
      try {
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
        if (config.env.B2_BACKUP_PG_ROOT_CERT) await fs.access(config.env.B2_BACKUP_PG_ROOT_CERT, constants.R_OK);
      } catch (error) { fail(error instanceof BackupJobError ? error.code : 'TOOL_UNAVAILABLE'); }
    },
    async validateDestination(config) {
      const args = ['--bucket', config.env.AWS_BACKUP_BUCKET];
      const version = await aws(config, ['get-bucket-versioning', ...args], 'PROVIDER_PREFLIGHT_FAILED');
      const lock = await aws(config, ['get-object-lock-configuration', ...args], 'PROVIDER_PREFLIGHT_FAILED');
      assertDestination(version, lock);
    },
    async createRun(config) {
      try {
        const root = config.env.B2_BACKUP_OUTPUT_DIR;
        const stat = await fs.lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
            stat.uid !== process.getuid() || await fs.realpath(root) !== root) fail('OUTPUT_UNSAFE');
        const directory = path.join(root, config.runId);
        await fs.mkdir(directory, {mode: 0o700});
        await fs.writeFile(path.join(directory, 'database.partial'), '', {flag: 'wx', mode: 0o600});
        return {directory};
      } catch { fail('OUTPUT_UNSAFE'); }
    },
    async dump(config, run) {
      await command('pg_dump', ['--format=custom', '--no-password', '--file', path.join(run.directory, 'database.partial')],
        postgresEnvironment(config.env, config.source), 'DUMP_FAILED');
    },
    async validateArchive(config, run) {
      const file = path.join(run.directory, 'database.partial');
      try {
        const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const header = Buffer.alloc(5);
          if ((await handle.read(header, 0, 5, 0)).bytesRead !== 5 || header.toString() !== 'PGDMP') fail('ARCHIVE_INVALID');
        } finally { await handle.close(); }
        const env = toolEnvironment(config.env); // No DB credentials; restore commands have no --dbname.
        await command('pg_restore', ['--list', file], env, 'ARCHIVE_INVALID');
        // Decode all data blocks, not merely the table of contents; output is discarded locally.
        await command('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--file=/dev/null', file], env, 'ARCHIVE_INVALID');
        await fs.rename(file, path.join(run.directory, 'database.dump'));
      } catch { fail('ARCHIVE_INVALID'); }
    },
    inspect: inspectFile,
    async captureObject(_config, run, index) {
      if (!approved) fail('MANIFEST_MODE_REQUIRED');
      assertManifestFresh(approved.manifest);
      if (!Number.isInteger(index) || index < 0 || index >= approved.objectCount) fail('MANIFEST_INVALID');
      const expected = approved.manifest.objects[index];
      const name = objectArtifactName(index);
      let file, stream, timer;
      try {
        if (!storageClient) {
          const {Client} = await import('@replit/object-storage');
          // Explicit authorized bucket only: no default bucket and no discovery/list operation.
          storageClient = new Client({bucketId: approved.manifest.source.bucketId});
        }
        assertManifestFresh(approved.manifest);
        file = await fs.open(path.join(run.directory, `${name}.partial`), 'wx', 0o600);
        assertManifestFresh(approved.manifest);
        const remaining = Date.parse(approved.manifest.authorization.expiresAtUtc) - Date.now();
        if (remaining <= 0) fail('MANIFEST_EXPIRED');
        stream = storageClient.downloadAsStream(expected.key, {decompress: false});
        const hash = createHash('sha256');
        let bytes = 0;
        const timeoutCode = remaining <= 600_000 ? 'MANIFEST_EXPIRED' : 'SOURCE_OBJECT_READ_FAILED';
        timer = setTimeout(() => stream.destroy(new BackupJobError(timeoutCode)), Math.min(600_000, remaining));
        timer.unref();
        for await (const chunk of stream) {
          assertManifestFresh(approved.manifest);
          const body = Buffer.from(chunk);
          bytes += body.length;
          if (bytes > expected.bytes) fail('SOURCE_OBJECT_MISMATCH');
          hash.update(body);
          await file.writeFile(body);
        }
        const checksum = hash.digest('hex');
        if (bytes !== expected.bytes || checksum !== expected.sourceIdentity.sha256) fail('SOURCE_OBJECT_MISMATCH');
        await file.sync();
        await file.close(); file = null;
        await fs.rename(path.join(run.directory, `${name}.partial`), path.join(run.directory, name));
        return {bytes, sha256: checksum};
      } catch (error) {
        fail(error instanceof BackupJobError ? error.code : 'SOURCE_OBJECT_READ_FAILED');
      } finally {
        clearTimeout(timer);
        stream?.destroy();
        await file?.close();
      }
    },
    async write(run, name, contents) {
      try { await fs.writeFile(path.join(run.directory, name), contents, {flag: 'wx', mode: 0o600}); }
      catch { fail('LOCAL_WRITE_FAILED'); }
      return inspectFile(run, name);
    },
    async upload(config, run, name, expected) {
      assertArtifact(expected);
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
  };
}
