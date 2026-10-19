import {syntheticCredential, syntheticCredentialUrl} from './synthetic-credential-fixture.mjs';
// SYNTHETIC ONLY. Owns one new local cluster, Unix socket only, no external targets.
// No env credentials, provider SDKs, operational backup adapter or existing DB.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {postgresOptions} from './backup-postgres-bounds.mjs';

const owned = new WeakMap();
const connections = new WeakMap();
const code = value => /^[0-9A-Z]{5}$/.test(value || '') ? value : 'LOCAL_FAILURE';
export class RehearsalError extends Error {
  constructor(stage, failure = 'LOCAL_FAILURE') {
    super(`${stage}:${code(failure)}`);
    this.code = code(failure);
  }
}
export function localToolEnvironment() {
  // Only executable lookup and locale; never spread process.env or PG/AWS inputs.
  return {PATH: process.env.PATH || '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC'};
}
async function localCommand(tool, args, {input, capture = false, timeout = 30_000} = {}) {
  // No shell, arbitrary executable or provider command accepted.
  if (!['initdb', 'pg_ctl', 'pg_dump', 'pg_restore'].includes(tool)) throw new RehearsalError('tool-denied');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(tool, args, {env: {...localToolEnvironment(),
      ...(tool === 'pg_dump' ? {PGOPTIONS: postgresOptions(), PGCONNECT_TIMEOUT: '10',
        PGAPPNAME: 'b2-synthetic-native-dump'} : {})}, shell: false,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe']}); }
    catch { reject(new RehearsalError('tool-spawn')); return; }
    const parts = [];
    let bytes = 0, overflow = false, expired = false;
    child.stderr.resume(); // Never return, log or retain raw tool diagnostics.
    child.stdout.on('data', b => {
      bytes += b.length;
      if (bytes > 8 * 1024 * 1024) { overflow = true; child.kill('SIGKILL'); }
      else if (capture) parts.push(b);
    });
    child.stdin?.on('error', () => {}); // Tool rejection may close stdin early.
    if (input) child.stdin.end(input);
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, timeout);
    child.on('error', () => { clearTimeout(timer); reject(new RehearsalError('tool-unavailable')); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({status, signal, expired, overflow, elapsedMs: Date.now() - started,
        ...(capture ? {bytes: Buffer.concat(parts)} : {})});
    });
  });
}
export function assertToolSuccess(result, stage) {
  if (result.status !== 0 || result.signal || result.expired || result.overflow) {
    throw new RehearsalError(stage);
  }
}
export async function createLocalCluster() {
  // Only this factory generates targets. There is deliberately no target argument.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'b2-role-rehearsal-'));
  await fs.chmod(root, 0o700);
  const stat = await fs.lstat(root);
  const cluster = Object.freeze({root, data: path.join(root, 'data'),
    socket: path.join(root, 'socket'), log: path.join(root, 'postgres.log'),
    database: 'b2_role_rehearsal', application: `synthetic-rehearsal-${randomUUID()}`});
  owned.set(cluster, {dev: stat.dev, ino: stat.ino, started: false, closed: false});
  connections.set(cluster, new Set());
  try {
    await fs.mkdir(cluster.socket, {mode: 0o700});
    assertToolSuccess(await localCommand('initdb', ['-D', cluster.data, '-A', 'trust',
      '-U', 'rehearsal_admin', '--no-locale', '--encoding=UTF8']), 'initdb');
    // Nothing listens on TCP. Trust authentication is restricted to the private
    // newly owned 0700 socket directory. No password exists for this fixture.
    const options = `-h '' -k ${cluster.socket} -p 5432 -c fsync=off ` +
      '-c log_statement=all -c log_min_error_statement=panic -c log_min_messages=log -c log_line_prefix=b2_%a_';
    assertToolSuccess(await localCommand('pg_ctl', ['-D', cluster.data, '-l', cluster.log,
      '-w', '-t', '15', 'start', '-o', options]), 'local-start');
    owned.get(cluster).started = true;
    return cluster;
  } catch (error) {
    await cleanupLocalCluster(cluster);
    throw error;
  }
}
async function assertOwned(cluster) {
  const record = owned.get(cluster);
  if (!record || record.closed) throw new RehearsalError('target-not-owned');
  const stat = await fs.lstat(cluster.root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== record.dev || stat.ino !== record.ino ||
      (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid()) {
    throw new RehearsalError('target-ownership');
  }
  return record;
}
export async function localClient(cluster, user = 'rehearsal_admin', database = cluster.database) {
  await assertOwned(cluster);
  if (!['rehearsal_admin', 'dynapharm_backup_ro', 'rehearsal_unrelated'].includes(user) ||
      !['postgres', cluster.database].includes(database)) throw new RehearsalError('connection-scope');
  const client = new pg.Client({
    host: cluster.socket, port: 5432, database, user,
    password: syntheticCredential("canary"), ssl: false,
    options: '-c application_name=b2-synthetic-role-rehearsal',
    application_name: cluster.application, connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
  });
  // pg.Client config is explicit, including password/options; no ambient PG input.
  try { await client.connect(); }
  catch { throw new RehearsalError('local-connect'); }
  connections.get(cluster).add(client);
  return client;
}
export async function closeLocalClient(cluster, client) {
  try { await client.end(); }
  finally { connections.get(cluster)?.delete(client); }
}
export async function localQuery(cluster, client, text, values = []) {
  await assertOwned(cluster);
  if (!connections.get(cluster)?.has(client)) throw new RehearsalError('connection-not-owned');
  try { return await client.query(text, values); }
  catch (error) {
    const safe = new RehearsalError('query', error.code);
    safe.diagnostic = {
      ...(Number.isSafeInteger(Number(error.position)) ? {position: Number(error.position)} : {}),
      ...(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(error.routine || '') ? {routine: error.routine} : {}),
    };
    throw safe;
  }
}
export async function syntheticDump(cluster) {
  await assertOwned(cluster);
  // No passed-in endpoint, connection string, password or output filename.
  // In-memory custom archive of generated data only; never an operational backup.
  return localCommand('pg_dump', ['--host', cluster.socket, '--port', '5432',
    '--username', 'dynapharm_backup_ro', '--dbname', cluster.database,
    '--format=custom', '--no-password', '--lock-wait-timeout=5000'],
  {capture: true, timeout: 120_000});
}
export async function localDumpEnvironment(cluster) {
  await assertOwned(cluster);
  return {...localToolEnvironment(), PGHOST: cluster.socket, PGPORT: '5432',
    PGDATABASE: cluster.database, PGUSER: 'rehearsal_admin', PGPASSWORD: 'SYNTHETIC_LOCAL_TRUST_UNUSED',
    PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10', PGOPTIONS: postgresOptions()};
}
export async function inspectSyntheticArchive(cluster, bytes) {
  await assertOwned(cluster);
  if (!Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024 ||
      bytes.subarray(0, 5).toString() !== 'PGDMP') throw new RehearsalError('archive-format');
  const list = await localCommand('pg_restore', ['--list'], {input: bytes, capture: true});
  assertToolSuccess(list, 'archive-list');
  const text = list.bytes.toString();
  const content = await localCommand('pg_restore',
    ['--exit-on-error', '--no-owner', '--no-privileges', '--file=/dev/null'], {input: bytes});
  assertToolSuccess(content, 'archive-content-validation');
  return {tables: /TABLE DATA synthetic items/.test(text),
    sequence: /SEQUENCE SET synthetic items_id_seq/.test(text),
    largeObject: /BLOB/.test(text), parsedWithoutDatabase: true};
}
export async function cleanupLocalCluster(cluster) {
  const record = await assertOwned(cluster);
  for (const client of connections.get(cluster)) {
    try { await client.end(); } catch { /* Report stopping failure below. */ }
  }
  connections.get(cluster).clear();
  // Check status even after failed startup: pg_ctl may have started before failure.
  const status = await localCommand('pg_ctl', ['-D', cluster.data, 'status']);
  if (status.status === 0) {
    const stop = await localCommand('pg_ctl', ['-D', cluster.data, '-m', 'immediate',
      '-w', '-t', '15', 'stop']);
    assertToolSuccess(stop, 'cleanup-stop');
    const after = await localCommand('pg_ctl', ['-D', cluster.data, 'status']);
    if (after.status !== 3) throw new RehearsalError('cleanup-still-running');
  } else if (status.status !== 3 && status.status !== 4) {
    throw new RehearsalError('cleanup-status');
  }
  await assertOwned(cluster);
  await fs.rm(cluster.root, {recursive: true, force: false});
  try { await fs.lstat(cluster.root); throw new RehearsalError('cleanup-remains'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  record.closed = true;
  return {serverStopped: true, ownedDirectoryRemoved: true, unrelatedResourcesTouched: false};
}
