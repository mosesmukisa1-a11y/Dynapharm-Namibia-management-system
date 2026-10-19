// Fixed reviewed ceilings. No environment, URL option or caller can increase these.
export const NATIVE_DUMP_QUERY_BOUNDS_STATUS = 'EXTERNAL_DEADLINE_CANCELLATION_VERIFICATION_SOURCE_BINDING_REQUIRED';

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
