// Offline/process-local only. No database, providers, credentials or source adapter.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {supervisorArguments, probeDumpSupervisor, resolveDumpSupervisor} from './lib/backup-bounded-dump.mjs';
import {createDumpMonitor} from './lib/backup-dump-monitor.mjs';
import {localToolEnvironment} from './lib/backup-login-rehearsal.mjs';

test('external Linux subreaper/pidfd capabilities available without native DB/provider tools', async () => {
  assert.equal((await probeDumpSupervisor(localToolEnvironment())).serverQueryTimeoutEnforced, false);
});

test('external deadline kills escaped TERM-ignoring descendant even while Node is blocked', {timeout: 10_000}, async () => {
  const python = await resolveDumpSupervisor(localToolEnvironment());
  const child = spawn(python, supervisorArguments(150, randomUUID(), '--synthetic-tree'),
    {env: localToolEnvironment(), shell: false, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe']});
  let text = '';
  child.stdio[3].on('data', b => { text += b; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({status, signal}));
  });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
  const exit = await done;
  assert.equal(exit.status, 0, text);
  assert.equal(exit.signal, null);
  const report = JSON.parse(text);
  assert.equal(report.deadlineExpired, true);
  assert.equal(report.treeEmpty, true);
  assert(report.elapsedMs < 500);
  assert(report.rootTerminationRequestedMs >= 140 && report.rootTerminationRequestedMs < 350);
  assert.equal(report.serverQueryTimeoutEnforced, false);
});

test('monitor rechecks backend start time, exact nonce and actor at cancellation', async () => {
  const calls = [];
  const client = {async query(q) {
    calls.push(q);
    if (calls.length === 1) return {rows: [{pid: 12345, started: 'SYNTHETIC', sameActor: true, sameDatabase: true}]};
    return {rows: []};
  }, async end() {}};
  const monitor = createDumpMonitor(client);
  assert.equal((await monitor.verifyAbsent('b2-dump-synthetic', {cancel: true})).backendAbsent, true);
  assert(calls[1].text.includes('backend_start::text = $3'));
  assert(calls[1].text.includes('usename = current_user AND datname = current_database()'));
  assert.deepEqual(calls[1].values, ['b2-dump-synthetic', 12345, 'SYNTHETIC']);
  await monitor.close();
});

for (const scenario of ['different-actor', 'different-database', 'ambiguous', 'unavailable']) {
  test(`monitor refuses cancellation for ${scenario} rather than signalling an unowned session`, async () => {
    let calls = 0;
    const row = {pid: 12345, started: 'SYNTHETIC', sameActor: scenario !== 'different-actor',
      sameDatabase: scenario !== 'different-database'};
    const monitor = createDumpMonitor({async query() {
      calls++;
      if (scenario === 'unavailable') throw new Error('SYNTHETIC_PRIVATE_MUST_NOT_LEAK');
      return {rows: scenario === 'ambiguous' ? [row, row] : [row]};
    }, async end() {}});
    await assert.rejects(monitor.verifyAbsent('synthetic', {cancel: true}), {code: 'DUMP_CANCELLATION_UNCONFIRMED'});
    assert.equal(calls, 1);
    await monitor.close();
  });
}

test('cancellation acknowledgement alone is insufficient without observed backend absence', async () => {
  const row = {pid: 12345, started: 'SYNTHETIC', sameActor: true, sameDatabase: true};
  const monitor = createDumpMonitor({async query(q) {
    return {rows: q.text.includes('pg_cancel_backend') ? [{cancelled: true}] : [row]};
  }, async end() {}});
  await assert.rejects(monitor.verifyAbsent('synthetic', {cancel: true, maximumMs: 60}),
    {code: 'DUMP_CANCELLATION_UNCONFIRMED'});
  await monitor.close();
});

test('hung monitor query is locally bounded and its socket destroyed', async () => {
  let destroyed = false;
  const monitor = createDumpMonitor({query: () => new Promise(() => {}),
    connection: {stream: {destroy() { destroyed = true; }}}, async end() {}});
  await assert.rejects(monitor.verifyAbsent('synthetic', {maximumMs: 50}),
    {code: 'DUMP_CANCELLATION_UNCONFIRMED'});
  assert(destroyed);
  await monitor.close();
});

test('supervisor source contains no delete, plaintext-file sink, credentials or arbitrary command selection', async () => {
  const source = await fs.readFile(new URL('./lib/backup-dump-watchdog.py', import.meta.url), 'utf8');
  assert(source.includes('pidfd_send_signal'));
  assert(source.includes('PR_SET_CHILD_SUBREAPER'));
  assert(!source.includes('shell=True'));
  assert(!source.includes('os.environ'));
  assert(!source.includes('unlink('));
  assert(source.includes('stdout=sys.stdout.buffer'));
});
