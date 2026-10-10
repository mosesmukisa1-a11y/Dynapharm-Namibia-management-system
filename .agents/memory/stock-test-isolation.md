---
name: Stock safety test isolation
description: Why receipt evidence and full-database safety baselines need different isolation from ordinary unit tests.
---
Tests that intentionally compare all real physical stock before and after must run without other DB fixture suites changing the same database.

**Why:** An unrelated suite's temporary fixture changes look identical to unintended stock changes in a whole-database safety baseline. Parallel execution can produce false corruption failures.

**How to apply:** Preserve serial execution for DB safety suites. If optimizing unit-test speed, separate no-database tests rather than enabling file parallelism across a shared database.

Receipt tests must establish isolated original dispatch allocations and confirmed physical receipt evidence, with cumulative quantities explicit; a journal entry alone is not proof of goods received.

**Why:** Current balances project physical/status layers, so a standalone inward journal or an arbitrary first projection row can falsely appear to prove stock custody or conceal a double receipt.

**How to apply:** Use per-case products/lots/source and destination identities, assert exact summed fixture quantities and posted receipt events, check the source is not deducted again, and clean every mutable fixture register.

Concurrency regression tests must prove actual contention and cover both valid winner orders.

**Why:** Starting two requests with Promise.all does not guarantee their database transactions overlap; a sequential execution can falsely appear to validate a race safeguard.

**How to apply:** Control scheduling without mocking SQL results or handler behavior, verify the competing real database transaction is blocked by the winning row lock, release it, and await both requests before assertions and cleanup.

Whole-system audits must use a separate test database or isolated environment, not merely uniquely named rows in the business database. Never connect their fixtures to live payment or other external services.

**Why:** The user explicitly requires business records to remain untouched during an end-to-end stock audit. Prefixes and cleanup do not prevent a mis-scoped handler or failing assertion from changing unrelated records.

**How to apply:** Use an empty schema-only clone, synthetic actors and fixtures, and isolated application connections; remove only the disposable environment afterward. Treat historical reconciliation as a separate approved action.

Routine database-backed regression tests have the same business-data isolation requirement as whole-system audits; no-database unit tests should remain independent of database provisioning.

**Why:** The user requires ordinary test invocations to be unable to modify business records, not just the main lifecycle audit. Fixture prefixes and cleanup are not sufficient protection.

**How to apply:** Preserve fail-closed isolation for all database test entry points, including direct test-runner invocations and custom PostgreSQL pools. Keep unrelated failing legacy regressions visible rather than changing stock business logic merely to make an isolation task green.

The workspace PostgreSQL transport may use a non-local hostname without supporting SSL.

**Why:** Hostname-based SSL inference broke connections to a successfully created schema-only clone even though PostgreSQL's own connection defaults worked.

**How to apply:** Disposable test connections should preserve the source connection's transport settings explicitly; do not infer SSL support solely from whether the host is named localhost.

Isolated browser environments also require a fresh disposable authentication signing key, not just a cloned database and different ports. Persist only a non-secret ownership manifest so the disposable database can be positively identified and removed.

**Why:** Browser cookies are not port-scoped, and a synthetic GM token signed with an inherited business key could be accepted by another local service. Supervising shells can also force-kill a test process before asynchronous socket shutdown finishes.

**How to apply:** Override signing keys only in the disposable child process; never print or persist them. Remove its owned database before waiting for frontend shutdown, and use recorded ownership rather than deleting every database with a test-looking name.

Canonical-only branch fixtures do not establish legacy-location coverage. Include a persisted legacy branch alias with a held or reserved unit when validating stock-report agreement.

**Why:** Different report reads can normalize owner names at different stages: available inventory can be positive while a canonical-only physical projection returns zero. Ordinary canonical lifecycle fixtures miss this failure.

**How to apply:** Verify canonical and authorized legacy-alias requests produce the same owned, available, held and original-cost totals, without treating warehouse aliases as branch owners.

Freeze source edits and builds during an interactive browser journey.

**Why:** Development-server reloads can discard open forms and active tabs, confusing an audit interruption with an application defect. A timed-out locator alone does not establish a stock-dispatch failure.

**How to apply:** Finish the coherent code batch before resuming the tester at its stopping point. Distinguish locator/reload interruptions from submitted transactions and preserve the disposable database when reloading its API.
