// Native data stdout -> existing AEAD writer only. No plaintext filesystem sink.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import {BackupJobError} from './backup-job-errors.mjs';
import {encryptToOwnedFile, verifyCiphertext, discardCiphertextArtifact} from './backup-ciphertext.mjs';

const WATCHDOG = fileURLToPath(new URL('./backup-dump-watchdog.py', import.meta.url));
export const BOUNDED_DUMP_CONTRACT = Object.freeze({
  processDeadlineMs: 120_000, processCleanupMs: 2_000, cancellationVerificationMs: 10_000,
  serverQueryTimeoutEnforced: false, requiresReservedMonitor: true,
});
export function assertExternalDumpPlatform() {
  if (process.platform !== 'linux') throw new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE');
  return BOUNDED_DUMP_CONTRACT;
}
export function supervisorArguments(deadlineMs, nonce, mode = '--dump') {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 120_000 ||
      !/^[a-f0-9-]{36}$/.test(nonce) || !['--dump', '--synthetic-tree'].includes(mode)) {
    throw new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE');
  }
  return ['-I', '-S', WATCHDOG, mode, String(deadlineMs), String(process.pid), nonce];
}
export async function resolveDumpSupervisor(env) {
  assertExternalDumpPlatform();
  const executable = await new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-S', WATCHDOG, '--probe'],
      {env: {PATH: env.PATH || '/usr/bin:/bin', LC_ALL: 'C'}, shell: false, stdio: ['ignore', 'pipe', 'ignore']});
    let text = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.stdout.on('data', b => { if (text.length + b.length <= 512) text += b; else child.kill('SIGKILL'); });
    child.once('error', () => { clearTimeout(timer); reject(new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE')); });
    child.once('close', status => {
      clearTimeout(timer);
      try {
        const row = JSON.parse(text);
        if (status !== 0 || row.linuxSubreaper !== true || row.pidfd !== true || row.externalDeadline !== true ||
            typeof row.interpreter !== 'string') throw 0;
        resolve(row.interpreter);
      } catch { reject(new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE')); }
    });
  });
  try {
    const real = await fs.realpath(executable), stat = await fs.stat(real);
    if (!/^\/(?:nix\/store\/[^/]+\/bin|usr\/bin)\/python[0-9.]*$/.test(real) ||
        !stat.isFile() || ![0, process.getuid()].includes(stat.uid) || (stat.mode & 0o222)) throw 0;
    return real;
  } catch { throw new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE'); }
}
export async function probeDumpSupervisor(env) {
  await resolveDumpSupervisor(env);
  return BOUNDED_DUMP_CONTRACT;
}
export async function runBoundedLogicalDump({run, env, monitor, deadlineMs = 120_000, emit = () => {}}) {
  assertExternalDumpPlatform();
  const nonce = randomUUID(), application = `b2-dump-${nonce}`;
  const args = supervisorArguments(deadlineMs, nonce);
  if (!monitor?.verifyAbsent || !monitor?.close) throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED');
  let child, metadata, report, failure, backend, childClosed = false, writer;
  try {
    // Before spawning: fail if the reserved monitor is unavailable. The production
    // factory separately enforces verified TLS/recovery/source identity.
    await monitor.verifyAbsent(application, {maximumMs: 1_000});
    const interpreter = await resolveDumpSupervisor(env);
    child = spawn(interpreter, args, {env: {...env, PGAPPNAME: application},
      detached: true, shell: false, stdio: ['ignore', 'pipe', 'ignore', 'pipe']});
    let text = '', overflow = false;
    child.stdio[3].on('data', b => {
      if (text.length + b.length > 1024) { overflow = true; child.kill('SIGTERM'); }
      else text += b;
    });
    let exitObserved = false, reportEnded = false, exitStatus, exitSignal, fallback;
    const completed = new Promise((resolve, reject) => {
      function finish() {
        if (!exitObserved || !reportEnded) return;
        clearTimeout(fallback);
        childClosed = true;
        try {
          const parsed = JSON.parse(text);
          if (overflow || exitStatus !== 0 || exitSignal || parsed.treeEmpty !== true ||
              typeof parsed.deadlineExpired !== 'boolean' || typeof parsed.aborted !== 'boolean' ||
              parsed.serverQueryTimeoutEnforced !== false) throw 0;
          resolve(parsed);
        } catch { reject(new BackupJobError('DUMP_PROCESS_CLEANUP_UNCONFIRMED')); }
      }
      child.once('error', () => reject(new BackupJobError('DUMP_SUPERVISOR_UNAVAILABLE')));
      // Exit, not close: an escaped/unconfirmed helper may still hold stdout.
      child.once('exit', (status, signal) => {
        exitObserved = true; exitStatus = status; exitSignal = signal; finish();
      });
      child.stdio[3].once('end', () => { reportEnded = true; finish(); });
      fallback = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new BackupJobError('DUMP_PROCESS_CLEANUP_UNCONFIRMED'));
      }, deadlineMs + BOUNDED_DUMP_CONTRACT.processCleanupMs + 5_000);
    }).catch(error => {
      clearTimeout(fallback);
      child.kill('SIGTERM');
      child.stdout.destroy(); // Abort a partial writer before owned-file cleanup.
      throw error;
    });
    // Encrypt concurrently; sink errors abort the external supervisor immediately.
    writer = encryptToOwnedFile(run, 'database.dump', child.stdout).catch(error => {
      child.kill('SIGTERM'); throw error;
    });
    const settled = await Promise.allSettled([completed, writer]);
    if (settled[0].status === 'rejected') throw settled[0].reason;
    report = settled[0].value;
    if (report.deadlineExpired) throw new BackupJobError('DUMP_DEADLINE_EXCEEDED');
    if (report.aborted || report.rootExitCode !== 0) throw new BackupJobError('DUMP_FAILED');
    if (settled[1].status === 'rejected') throw settled[1].reason;
    metadata = settled[1].value;
    await verifyCiphertext(run, 'database.dump');
  } catch (error) {
    failure = error instanceof BackupJobError ? error : new BackupJobError('DUMP_FAILED');
  } finally {
    if (child && !childClosed) child.kill('SIGTERM');
    try { backend = await monitor.verifyAbsent(application, {cancel: Boolean(failure)}); }
    catch { failure = new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED'); }
    try { await monitor.close(); }
    catch { failure = new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED'); }
    if (failure) {
      try { await discardCiphertextArtifact(run, 'database.dump'); }
      catch { failure = new BackupJobError('CLEANUP_FAILED'); }
    }
    emit({event: 'b2.dump', status: failure ? 'FAILED' : 'PASS',
      ...(failure ? {code: failure.code} : {}),
      processTreeEmpty: report?.treeEmpty === true, deadlineExpired: report?.deadlineExpired === true,
      backendAbsent: backend?.backendAbsent === true, serverQueryTimeoutEnforced: false,
      cancellationRequested: backend?.cancellationRequested === true,
      ...(report ? {dumpElapsedMs: report.elapsedMs, rootExitCode: report.rootExitCode,
        rootSignal: report.rootSignal, rootTerminationRequestedMs: report.rootTerminationRequestedMs} : {})});
  }
  if (failure) throw failure;
  return metadata;
}
