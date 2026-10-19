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

function assertDeadlineOutcome(report, exit, configuredMs, watchdogExpired = false) {
  assert.equal(watchdogExpired, false, 'outer hang watchdog fired');
  assert.equal(exit.status, 0);
  assert.equal(exit.signal, null);
  assert.equal(report.deadlineExpired, true);
  assert.equal(report.aborted, false);
  assert.equal(report.treeEmpty, true);
  assert.equal(report.rootSignal, 9);
  assert.equal(report.rootExitCode, -9);
  assert(Number.isFinite(report.rootTerminationRequestedMs));
  // Supervisor timestamps are rounded milliseconds, not Node event-loop timing.
  assert(report.rootTerminationRequestedMs >= configuredMs - 1);
  assert(Number.isFinite(report.elapsedMs));
  assert(report.elapsedMs >= report.rootTerminationRequestedMs);
  assert.equal(report.serverQueryTimeoutEnforced, false);
}

test('external deadline kills escaped TERM-ignoring descendant even while Node is blocked', {timeout: 15_000}, async () => {
  const configuredMs = 150;
  const python = await resolveDumpSupervisor(localToolEnvironment());
  const args = supervisorArguments(configuredMs, randomUUID(), '--synthetic-tree');
  assert.equal(args[4], String(configuredMs));
  const child = spawn(python, args,
    {env: localToolEnvironment(), shell: false, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe']});
  let text = '';
  child.stdio[3].on('data', b => { text += b; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({status, signal}));
  });
  let watchdogExpired = false;
  // Hang protection only, NOT a replacement/extension of the supervisor's 150ms
  // fixture deadline or production's unchanged 120s deadline. TERM asks the
  // owned subreaper to abort and reap its escaped descendants.
  const watchdog = setTimeout(() => { watchdogExpired = true; child.kill('SIGTERM'); }, 8_000);
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
    const exit = await done;
    assertDeadlineOutcome(JSON.parse(text), exit, configuredMs, watchdogExpired);
  } finally {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
});

test('deadline contract rejects ignored expiry, surviving descendants and failed termination', () => {
  const good = {deadlineExpired:true,aborted:false,treeEmpty:true,rootSignal:9,
    rootExitCode:-9,rootTerminationRequestedMs:150,elapsedMs:160,serverQueryTimeoutEnforced:false};
  const exit = {status:0,signal:null};
  assertDeadlineOutcome(good,exit,150);
  // Scheduling delay alone is not failure when all termination evidence holds.
  assertDeadlineOutcome({...good,rootTerminationRequestedMs:700,elapsedMs:900},exit,150);
  for (const patch of [{deadlineExpired:false},{treeEmpty:false},{aborted:true},
    {rootExitCode:0},{rootSignal:null},{rootTerminationRequestedMs:null},
    {rootTerminationRequestedMs:10},{elapsedMs:NaN},{elapsedMs:100}])
    assert.throws(()=>assertDeadlineOutcome({...good,...patch},exit,150));
  assert.throws(()=>assertDeadlineOutcome(good,{status:1,signal:null},150));
  assert.throws(()=>assertDeadlineOutcome(good,exit,150,true));
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
