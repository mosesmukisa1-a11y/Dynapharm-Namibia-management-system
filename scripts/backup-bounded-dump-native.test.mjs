// Newly owned Unix-only synthetic cluster; no role creation, PUBLIC changes,
// production connection, operational backup/restore, AWS or external provider.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID, randomBytes} from 'node:crypto';
import {
  createLocalCluster, localClient, localQuery, closeLocalClient, cleanupLocalCluster,
  localDumpEnvironment, inspectSyntheticArchive,
} from './lib/backup-login-rehearsal.mjs';
import {runBoundedLogicalDump, probeDumpSupervisor} from './lib/backup-bounded-dump.mjs';
import {createDumpMonitor} from './lib/backup-dump-monitor.mjs';
import {
  createCiphertextRun, attachRunKey, cleanupCiphertextRun, verifyCiphertext, decryptOwnedFile,
} from './lib/backup-ciphertext.mjs';

const dir = new URL('../generated-artifacts/b2-bounded-logical-backup/', import.meta.url);
test('bounded native dump, ciphertext, verified cancellation and local cleanup', {timeout: 60_000}, async t => {
  const checks = [], started = Date.now();
  let cluster, admin, cleanup, longRun, normalRun;
  const q = (client, text, values) => localQuery(cluster, client, text, values);
  async function check(name, fn) {
    await t.test(name, async () => {
      try { await fn(); checks.push({name, status: 'PASS'}); }
      catch (error) {
        const category = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'ASSERTION_OR_LOCAL_FAILURE';
        checks.push({name, status: 'FAIL', category});
        throw new Error(`${name}:${category}`);
      }
    });
  }
  async function runFixture() {
    const root = `/tmp/b2-ciphertext-${randomUUID()}`;
    await fs.mkdir(root, {mode: 0o700});
    let run;
    try { run = await createCiphertextRun(root, `20261019T000000000Z_${randomUUID()}`); }
    catch (error) { await fs.rmdir(root); throw error; }
    attachRunKey(run, randomBytes(32), Buffer.from('SYNTHETIC_WRAPPED_KEY_NO_PROVIDER').toString('base64'));
    return {root, run, async clean() {
      await cleanupCiphertextRun(run);
      await fs.rmdir(root);
    }};
  }
  async function monitor() {
    const client = await localClient(cluster);
    await q(client, "SET default_transaction_read_only=on; SET statement_timeout='750ms'; SET lock_timeout='500ms'");
    return createDumpMonitor(client);
  }
  try {
    cluster = await createLocalCluster();
    const bootstrap = await localClient(cluster, 'rehearsal_admin', 'postgres');
    await q(bootstrap, 'CREATE DATABASE b2_role_rehearsal');
    await closeLocalClient(cluster, bootstrap);
    admin = await localClient(cluster);
    await q(admin, `CREATE SCHEMA synthetic;
      CREATE TABLE synthetic.items(id serial PRIMARY KEY, label text);
      INSERT INTO synthetic.items(label) VALUES ('B2_SYNTHETIC_PLAINTEXT_SENTINEL_A'),('B2_SYNTHETIC_PLAINTEXT_SENTINEL_B');
      SELECT lo_from_bytea(90001,decode('53594e544845544943','hex'))`);
    const env = await localDumpEnvironment(cluster);
    await probeDumpSupervisor({PATH: env.PATH, LC_ALL: 'C'});

    await check('normal complete native custom archive is ciphertext-only and backend/process cleanup verified', async () => {
      const fixture = await runFixture(), logs = [];
      try {
        const meta = await runBoundedLogicalDump({run: fixture.run, env, monitor: await monitor(),
          deadlineMs: 10_000, emit: e => logs.push(e)});
        assert(meta.encrypted);
        assert.equal((await verifyCiphertext(fixture.run, 'database.dump')).authenticated, true);
        const encrypted = await fs.readFile(`${fixture.run.directory}/database.dump`);
        assert.equal(encrypted.subarray(0,8).toString(), 'B2GCM001');
        assert(!encrypted.includes(Buffer.from('B2_SYNTHETIC_PLAINTEXT_SENTINEL_A')));
        const chunks = [];
        for await (const b of decryptOwnedFile(fixture.run, 'database.dump')) chunks.push(b);
        const bytes = Buffer.concat(chunks);
        assert.deepEqual(await inspectSyntheticArchive(cluster, bytes),
          {tables: true, sequence: true, largeObject: true, parsedWithoutDatabase: true});
        bytes.fill(0); chunks.forEach(b => b.fill(0));
        assert.equal(logs.at(-1).status, 'PASS');
        assert.equal(logs.at(-1).processTreeEmpty, true);
        assert.equal(logs.at(-1).backendAbsent, true);
        normalRun = {ciphertextBytes: meta.bytes, ciphertextSha256: meta.sha256, ...logs.at(-1)};
      } finally { await fixture.clean(); }
    });

    await check('synthetic locked long-running dump reaches hard deadline, leaves no backend or ciphertext artifact', async () => {
      const fixture = await runFixture(), logs = [];
      await q(admin, 'BEGIN; LOCK TABLE synthetic.items IN ACCESS EXCLUSIVE MODE');
      try {
        const before = performance.now();
        const promise = runBoundedLogicalDump({run: fixture.run, env, monitor: await monitor(),
          deadlineMs: 700, emit: e => logs.push(e)});
        // Verify a real native backend was waiting on the synthetic lock.
        let seen = false;
        for (let i = 0; i < 20 && !seen; i++) {
          await q(admin, 'SELECT pg_stat_clear_snapshot()');
          const row = (await q(admin, `SELECT count(*)::integer AS n FROM pg_stat_activity
            WHERE application_name LIKE 'b2-dump-%' AND wait_event_type='Lock'`)).rows[0];
          seen = row.n === 1;
          if (!seen) await new Promise(resolve => setTimeout(resolve, 20));
        }
        await assert.rejects(promise, {code: 'DUMP_DEADLINE_EXCEEDED'});
        longRun = {...logs.at(-1), observedNativeLockWait: seen, elapsedMs: Math.round(performance.now()-before)};
        assert(seen);
        assert(performance.now() - before < 4_000);
        assert.deepEqual(await fs.readdir(fixture.run.directory), []);
        assert.equal(logs.at(-1).processTreeEmpty, true);
        assert.equal(logs.at(-1).backendAbsent, true);
        await q(admin, 'SELECT pg_stat_clear_snapshot()');
        assert.equal((await q(admin, "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE application_name LIKE 'b2-dump-%'")).rows[0].n, 0);
      } finally { await q(admin, 'ROLLBACK'); await fixture.clean(); }
    });

    await check('native five-second lock-wait ceiling fails before a longer overall deadline', async () => {
      const fixture = await runFixture();
      await q(admin, 'BEGIN; LOCK TABLE synthetic.items IN ACCESS EXCLUSIVE MODE');
      try {
        const at = performance.now();
        await assert.rejects(runBoundedLogicalDump({run: fixture.run, env, monitor: await monitor(),
          deadlineMs: 9_000}), {code: 'DUMP_FAILED'});
        assert(performance.now()-at < 8_500);
        assert.deepEqual(await fs.readdir(fixture.run.directory), []);
      } finally { await q(admin, 'ROLLBACK'); await fixture.clean(); }
    });

    await check('unavailable owned local socket fails without retries or surviving ciphertext/backend', async () => {
      const fixture = await runFixture();
      try {
        await assert.rejects(runBoundedLogicalDump({run: fixture.run,
          env: {...env, PGHOST: `${cluster.root}/not-a-socket`}, monitor: await monitor(),
          deadlineMs: 3_000}), {code: 'DUMP_FAILED'});
        assert.deepEqual(await fs.readdir(fixture.run.directory), []);
      } finally { await fixture.clean(); }
    });

    await check('unverifiable cancellation refuses otherwise valid dump and removes owned ciphertext', async () => {
      const fixture = await runFixture();
      const actual = await monitor();
      let calls = 0;
      const unavailable = {async verifyAbsent(...args) {
        if (++calls > 1) throw new Error('SYNTHETIC_PRIVATE_MUST_NOT_LEAK');
        return actual.verifyAbsent(...args);
      }, close: () => actual.close()};
      try {
        await assert.rejects(runBoundedLogicalDump({run: fixture.run, env, monitor: unavailable}),
          {code: 'DUMP_CANCELLATION_UNCONFIRMED'});
        assert.deepEqual(await fs.readdir(fixture.run.directory), []);
      } finally { await fixture.clean(); }
    });

    await check('failed ciphertext sink cannot overwrite or unlink an unowned file', async () => {
      const fixture = await runFixture();
      const foreign = `${fixture.run.directory}/database.dump.partial`;
      await fs.writeFile(foreign, 'SYNTHETIC_FOREIGN_OWNER_FILE', {flag: 'wx'});
      try {
        await assert.rejects(runBoundedLogicalDump({run: fixture.run, env, monitor: await monitor()}));
        assert.equal(await fs.readFile(foreign, 'utf8'), 'SYNTHETIC_FOREIGN_OWNER_FILE');
      } finally { await fs.unlink(foreign); await fixture.clean(); }
    });
    await check('source synthetic rows and unrelated administrator session remain unchanged', async () => {
      assert.equal((await q(admin, 'SELECT count(*)::integer AS n FROM synthetic.items')).rows[0].n, 2);
      assert.equal((await q(admin, 'SELECT 1 AS n')).rows[0].n, 1);
    });
  } finally {
    try { if (cluster) cleanup = await cleanupLocalCluster(cluster); }
    finally {
      await fs.mkdir(dir, {recursive: true});
      await fs.writeFile(new URL('native-results.json', dir), JSON.stringify({
        scope: 'ISOLATED_SYNTHETIC_ONLY', atUtc: new Date().toISOString(), elapsedMs: Date.now()-started,
        checks, pass: checks.filter(c=>c.status==='PASS').length, fail: checks.filter(c=>c.status==='FAIL').length,
        normalRun, longRun, cleanup, productionCalls: 0, providerCalls: 0,
        rolesOrCredentialsCreated: false, publicPrivilegesChanged: false,
        productionModified: false, productionPublished: false, rpoRto: 'UNPROVEN',
      }, null, 2)+'\n');
    }
  }
});
