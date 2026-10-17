# Security release and guarded recovery plan — NOT EXECUTED

## A. Preflight

- Obtain an independently reviewable fresh lockfile installation and production
  build. Workspace builds use existing dependencies and are not clean-install
  evidence. The managed package interface does not provide a temporary,
  lockfile-only clean-install operation; no shell install bypass is authorized.
- Independently confirm actual production artifact/source, command, service,
  replicas, timer/scheduler ownership and startup configuration.
- Confirm protected backup/PITR metadata and an independent restore rehearsal
  meeting the previously required 15-minute RPO / one-hour RTO. Existing reports
  are not proof that these recovery objectives have been achieved.
- Confirm affected active account IDs and owners without reading passwords.
  Source-derived candidates alone are not sufficient.
- Communicate maintenance and private credential delivery arrangements.
- Review the sanitized candidate and guarded recovery manifest. Do not distribute
  raw removal diffs or old Git archives: retained history/removal hunks can expose
  the original compromised values. Git history was NOT rewritten.
- Review target `users.metadata`, `must_change_password` and authentication schema
  read-only under a new scoped authorization. No new DDL is required by the
  credential/session mechanism. No migration 035 is approved by this work.
- Explicit production startup values must be:
  `STARTUP_MODE=code-only`, `ALLOW_SCHEMA_SYNC=false`,
  `ALLOW_REFERENCE_SEEDS=false`, `ALLOW_INVENTORY_SEED=false`,
  `ALLOW_STOCK_SUMMARY_DDL=false`, `ENABLE_STOCK_SCHEDULER=false`,
  `ENABLE_STOCK_HEALTH_DIGEST=false`, `WORKER_ENABLED=false`.
  All configured worker task flags must be false. Malformed/enabled task flags
  fail closed. Missing required web safety flags fail before server import.
- Configure a protected signing secret through the managed secrets process,
  never a source literal or a command transcript. Existing production values
  were not inspected or changed in this phase.

## B. Later separately approved security deployment

The candidate deployment command is
`node scripts/start-code-only-web.mjs` (equivalent to `npm run start:web`).
Only code is released; do not run legacy credential import/seed scripts.
Legacy scheduler remains disabled; new worker remains disabled. No schema sync,
reference/inventory seed, summary DDL, due-price activation or stock repair is
permitted by startup or read middleware. Normal authorized staff transactions
remain enabled; full isolated stock tests are separate evidence from startup.

A later release must explicitly address the existing deployed legacy process.
Changing the candidate command does not stop a running production scheduler;
none was stopped here. Confirm ownership and separately authorize service
replacement/retirement. Do not imply that the production exposure is already fixed.

## C. Later separately approved credential rotation

Follow `password-rotation-runbook.md`. Exact-ID scoped production execution gates
and a current authorized session are required. Staff reset and account-session
invalidation are distinct from database/provider/signing-secret rotation, which
require their own approved operational procedure.

## D. Non-mutating release verification and controlled staff validation

Review actual deployed shared middleware before allowing any health or portal
checks; a GET is not intrinsically non-mutating. Verify source/command identity,
safe health, new credentials, rejection of old credentials/sessions, current role
and branch enforcement, and unrelated-account session continuity. The owner
must perform private password checks without revealing credentials to the agent.
Observe the next known legacy scheduler window and prove no legacy scheduler
logs/second process exists; lack of a log line alone is not identity proof.
Use approved synthetic or explicitly authorized staff transactions to confirm
sales remain operational without duplicate stock operations.

## Guarded rollback and recovery

Never deploy the raw historical production tree or the pre-remediation HEAD:
both may contain exposed credentials/legacy bootstrap. An acceptable fallback
must be independently reviewed, retain the strict launcher and credential
removal/session protections, and pass the same no-write startup gate. Preserve
the exact source/artifact manifest and recovery authorization.

The offline guarded-copy rehearsal validates strict policy callbacks and startup
contracts on a restored candidate copy only. It is NOT a production restore,
PITR rehearsal, service cutover, measured RPO/RTO or proof that an old deployment
is safe. If this candidate is not operational, keep the release blocked rather
than restore exposed passwords or start legacy automation.

No production rollback, migration, configuration change, credential rotation,
service restart or publication was performed.
