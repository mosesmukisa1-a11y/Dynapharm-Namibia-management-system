// Fixed reviewed ceilings. No environment, URL option or caller can increase these.
import {BackupJobError} from './backup-job-errors.mjs';

export const NATIVE_DUMP_QUERY_BOUNDS_STATUS = 'BLOCKED_NATIVE_PG_DUMP_RESETS_SERVER_TIMEOUTS';

export const POSTGRES_BOUNDS = Object.freeze({
  connectMs: 10_000, preflightMs: 10_000, statementMs: 120_000,
  lockMs: 5_000, idleTransactionMs: 30_000, dumpProcessMs: 120_000,
});

export function postgresOptions({preflight = false} = {}) {
  return `-c default_transaction_read_only=on -c statement_timeout=${preflight ?
    POSTGRES_BOUNDS.preflightMs : POSTGRES_BOUNDS.statementMs}` +
    ` -c lock_timeout=${POSTGRES_BOUNDS.lockMs}` +
    ` -c idle_in_transaction_session_timeout=${POSTGRES_BOUNDS.idleTransactionMs}`;
}

export function assertNativeDumpQueryBounds() {
  // Native pg_dump issues SET statement_timeout=0 and lock_timeout=0 after login.
  // PGOPTIONS and ALTER ROLE defaults are therefore NOT enforcement. A client
  // watchdog alone also does not prove timely server-side query cancellation.
  // No reviewed native per-query enforcement mechanism is currently implemented.
  // Do not add an acknowledgement/env override or infer support from a version.
  throw new BackupJobError('DUMP_QUERY_TIMEOUT_UNSUPPORTED');
}
