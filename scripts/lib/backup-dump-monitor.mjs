// Fixed catalog-only scope. No query text, application rows or raw diagnostics.
import {BackupJobError} from './backup-job-errors.mjs';

const SCAN = `SELECT pid, backend_start::text AS started,
  usename = current_user AS "sameActor", datname = current_database() AS "sameDatabase"
  FROM pg_catalog.pg_stat_activity WHERE application_name = $1`;
const CANCEL = `SELECT pg_catalog.pg_cancel_backend(pid) AS cancelled
  FROM pg_catalog.pg_stat_activity WHERE application_name = $1 AND pid = $2
  AND backend_start::text = $3 AND usename = current_user AND datname = current_database()`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createDumpMonitor(client) {
  let closed = false;
  client.on?.('error', () => {}); // Never leak raw idle socket/provider errors.
  async function query(text, args, timeout = 1_000) {
    if (closed) throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED');
    let timer;
    try {
      return await Promise.race([client.query({text, values: args, query_timeout: timeout}),
        new Promise((_, reject) => { timer = setTimeout(() => {
          client.connection?.stream?.destroy();
          reject(new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED'));
        }, timeout); })]);
    }
    catch { throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED'); }
    finally { clearTimeout(timer); }
  }
  return {
    async verifyAbsent(application, {cancel = false, maximumMs = 10_000} = {}) {
      const end = performance.now() + Math.min(maximumMs, 10_000);
      let cancellationRequested = false;
      while (performance.now() < end) {
        const remaining = () => Math.max(1, Math.min(1_000, Math.floor(end - performance.now())));
        const {rows} = await query(SCAN, [application], remaining());
        if (!rows.length) return {backendAbsent: true, cancellationRequested};
        if (rows.length !== 1 || rows[0].sameActor !== true || rows[0].sameDatabase !== true ||
            !Number.isInteger(rows[0].pid) || typeof rows[0].started !== 'string') {
          throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED');
        }
        if (cancel && !cancellationRequested) {
          // SQL rechecks exact start time, identity and nonce at signal time.
          if (performance.now() >= end) throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED');
          await query(CANCEL, [application, rows[0].pid, rows[0].started], remaining());
          cancellationRequested = true;
        }
        await sleep(Math.min(25, Math.max(1, end - performance.now())));
      }
      throw new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED');
    },
    async close() {
      closed = true;
      // Destroy the reserved monitor socket before end, so a broken connection
      // cannot make cleanup wait without bound. No other session is touched.
      client.connection?.stream?.destroy();
      let timer;
      try {
        await Promise.race([client.end(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new BackupJobError('DUMP_CANCELLATION_UNCONFIRMED')), 1_000);
        })]);
      } finally { clearTimeout(timer); }
    },
  };
}
