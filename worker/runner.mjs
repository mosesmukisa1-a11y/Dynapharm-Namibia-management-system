import {executionArguments,withQueryContext, registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../api/services/queryDescriptors.js";import { randomUUID, createHash } from 'node:crypto';
import { TASK_BY_ID } from './tasks.mjs';
import { detectDrift } from './drift.mjs';
import { windhoekParts, workerEvent } from './dates.mjs';
const digest = (s) => createHash('sha256').update(s).digest('hex');
const cancelled = () => Object.assign(Error('Worker cancelled'), { code: 'WORKER_CANCELLED' });
const timeout = () => Object.assign(Error('Worker deadline exceeded'), { code: 'WORKER_TIMEOUT' });
export function identity(task, date, scope) {
  const scopeHash = digest(JSON.stringify([...scope].sort((a, b) => (a.type + ':' + a.id).localeCompare(b.type + ':' + b.id))));
  const key = digest(`stock-worker:v1:${task}:${date}:${scopeHash}`);
  const lockHash = digest('stock-worker-task:' + task.replace(/:dry-run$/, ''));
  return { key, scopeHash, lock: BigInt.asIntN(64, BigInt('0x' + lockHash.slice(0, 16))).toString() };
}
export async function runTask({ pool, config, taskId, businessDate = windhoekParts().date,
  dryRun = false, signal, log = (event) => console.info(JSON.stringify(event)), testImplementation }) {
  const task = TASK_BY_ID.get(taskId);
  if (!task || task.status !== 'ENABLED' || !config.enabled || !config.jobs.some((t) => t.id === taskId))
  throw Error('Worker task not authorized');
  if (businessDate !== windhoekParts().date) throw Error('Historical worker invocation refused');
  if (testImplementation && !(process.env.NODE_ENV === 'test' && process.env.STOCK_AUDIT_ISOLATED === '1'))
  throw Error('Fault injection is isolated-test only');
  const impl = testImplementation || detectDrift,{ key, scopeHash, lock } = identity(taskId + (dryRun ? ':dry-run' : ''), businessDate, config.scope);
  const client = await pool.connect();let locked = false;
  const emit = (kind, detail = {}) => log(workerEvent({ kind, taskId, businessDate, correlationId: key, serviceActor: 'stock-worker', ...detail }));
  let id;
  async function event(kind, attempt, detail = {}, emitNow = true) {
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:27:0"),

    [randomUUID(), id, kind, attempt, businessDate, JSON.stringify(detail)]);
    if (emitNow) emit(kind, { runId: id, attempt, ...detail });
  }
  try {
    locked = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:33:1"), [lock])).rows[0].locked;
    if (!locked) {emit('skip', { reason: 'distributed_lock_busy' });return { status: 'skipped', reason: 'locked' };}
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:35:2"),

    [randomUUID(), key, taskId, businessDate, scopeHash, JSON.stringify(config.scope)]);
    let run = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:38:3"), [key])).rows[0];id = run.id;
    if (['succeeded', 'dry_run'].includes(run.status)) {
      await event('skip', run.attempts, { reason: 'already_completed' });return { status: 'skipped', runId: id, reason: 'completed' };
    }
    if (run.attempts >= config.maxAttempts) {emit('skip', { runId: id, reason: 'retry_budget_exhausted' });return { status: 'failed', runId: id };}
    while (run.attempts < config.maxAttempts) {
      if (signal?.aborted) throw cancelled();
      if (run.next_retry_at && new Date(run.next_retry_at) > new Date()) {
        const wait = Math.min(new Date(run.next_retry_at) - Date.now(), config.backoffMs * 2 ** config.maxAttempts);
        await new Promise((r) => setTimeout(r, wait));
      }
      if (signal?.aborted) {await event('cancelled', run.attempts, { reason: 'shutdown_between_attempts' });return { status: 'cancelled', runId: id };}
      const attempt = run.attempts + 1,abort = new AbortController(),deadline = Date.now() + config.timeoutMs;
      const abortOnShutdown = () => abort.abort(cancelled());signal?.addEventListener('abort', abortOnShutdown, { once: true });
      let timer,rowsRead = 0,rowsWritten = 0;
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:53:4"), []);
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:54:5"), [id, attempt]);
      await event('start', attempt, { dryRun });await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:55:6"), []);
      try {
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:57:7"), []);
        const check = () => {if (abort.signal.aborted) throw abort.signal.reason || cancelled();if (Date.now() >= deadline) throw timeout();};
        const query = async (sql, args) => {
          check();await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:60:8"), [String(Math.max(1, deadline - Date.now()))]);
          const r = await __qd_executePlan(client.query.bind(client), sql, args);check();return r;
        };
        const ctx = { scope: config.scope, signal: abort.signal,
          read: async (sql, args) => {
            const admitted=withQueryContext('worker',()=>executionArguments(sql,args));
            if (admitted.operation!=='read'||!admitted.queryId.startsWith('worker/drift.mjs:'))
            throw Error('Worker read interface rejected non-read SQL');
            const r = await __qd_executePlan(query, sql, args);rowsRead += r.rowCount;return r;
          },
          finding: async (f) => {
            check();if (!config.scope.some((s) => s.type === f.type && s.id === f.id)) throw Error('Finding scope denied');
            const r = await __qd_executePlan(query, __qd_registeredPlan("worker/runner.mjs:71:9"),


            [randomUUID(), id, f.type, f.id, f.product_name, f.finding_type, f.cached_quantity, f.known_physical_quantity, f.difference]);
            rowsWritten += r.rowCount;
          } };
        await Promise.race([impl(ctx), new Promise((_, reject) => {
          timer = setTimeout(() => {abort.abort(timeout());reject(timeout());}, config.timeoutMs);
        })]);clearTimeout(timer);check();
        if (dryRun) {
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:81:10"), []);
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:82:11"), [id, rowsRead]);
          await event('dry_run', attempt, { rowsRead, rowsWritten: 0, wouldWrite: rowsWritten });
          return { status: 'dry_run', runId: id, rowsRead, rowsWritten: 0 };
        }
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:86:12"), [id, rowsRead, rowsWritten]);
        await event('success', attempt, { rowsRead, rowsWritten }, false);
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:88:13"), []);
        emit('success', { runId: id, attempt, rowsRead, rowsWritten });
        return { status: 'succeeded', runId: id, rowsRead, rowsWritten };
      } catch (error) {
        clearTimeout(timer);abort.abort(error);
        try {await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:93:14"), []);} catch {/* Disconnect releases session lock; next process resumes journal. */}
        // A lost COMMIT acknowledgement must not overwrite a committed success.
        const confirmed = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:95:15"), [id]);
        if (confirmed.rows[0]?.status === 'succeeded') {emit('success', { runId: id, attempt, recoveredCommit: true });return { status: 'succeeded', runId: id };}
        const stop = signal?.aborted || error.code === 'WORKER_CANCELLED';
        const delay = config.backoffMs * 2 ** (attempt - 1),retry = attempt < config.maxAttempts && !stop;
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:99:16"),
        [id, stop ? 'cancelled' : 'failed', retry ? new Date(Date.now() + delay) : null]);
        const safeCode = /^[A-Z0-9_]{2,40}$/.test(error.code || '') ? error.code : 'TASK_FAILED';
        await event(stop ? 'cancelled' : 'failure', attempt, { errorCode: safeCode, rowsRead, rowsWritten: 0, retry });
        await event('failure_alert', attempt, { errorCode: safeCode, delivery: 'durable-journal-and-structured-stderr' });
        if (!retry) return { status: stop ? 'cancelled' : 'failed', runId: id };
        run = { ...run, attempts: attempt, next_retry_at: new Date(Date.now() + delay) };
      } finally {clearTimeout(timer);signal?.removeEventListener('abort', abortOnShutdown);}
    }
  } finally {
    if (locked) await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("worker/runner.mjs:109:17"), [lock]).catch(() => {});
    client.release();
  }
}
