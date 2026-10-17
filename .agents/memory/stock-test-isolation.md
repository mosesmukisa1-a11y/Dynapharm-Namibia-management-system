---
name: Stock safety test isolation
description: Why receipt evidence and full-database safety baselines need different isolation from ordinary unit tests.
---
Directly seeded physical balances do not establish movement-derived opening evidence.

**Why:** A physically conserving audit can still lack the history needed for its period formula. That discrepancy is not proof of lost goods.

**How to apply:** Create explicitly labelled synthetic pre-period opening evidence with a fresh fixture when needed. It is setup, not staff receiving verification. Preserve the incomplete phase; never backfill a result just to obtain a pass.

An isolated browser URL does not isolate a tester's default database helper.

**Why:** A delegated authentication check used an unbound notebook query helper while investigating synthetic account IDs. Its connection/environment was not recorded, so the surrounding browser evidence could not establish database-read isolation.

**How to apply:** Supply exact synthetic account IDs in advance and enforce explicit, guarded fixture connections for any database verification. Forbid default helpers; if one is used, stop database investigation, record the exact read/write boundary and mark isolation NOT VERIFIED. Do not infer production access or its absence from empty results.

Keep observed-request counts separate from interception counts in browser fault tests.

**Why:** Incrementing one shared guard in both a request observer and its route handler falsely classified a single attempt as a duplicate and prevented any server request.

**How to apply:** Diagnose interception exceptions and inspect server-side stock/transaction evidence before treating a fetch failure as an application defect or retrying a sale.

Metadata-only approval evidence does not establish quantity-edit safety.

**Why:** Earlier GM browser checks approved expiry changes, while the subsequently reported Approve All failure involved warehouse quantities. These exercise different writes, movements and balance refreshes.

**How to apply:** When reviewing approval evidence, distinguish metadata edits from quantity corrections; include unchanged/zero targets and a later-item failure without using live requests as test fixtures.

Compare before/after balances only within the same disposable audit phase.

**Why:** An interrupted backend recovery required a fresh empty phase after a 10-unit fixture. Combining their totals would falsely report a 10-unit loss although both phases preserved stock.

**How to apply:** Retain earlier evidence, label each phase's baseline and source environment, and never interpret a new fixture's zero balance as a deduction from the previous fixture.

Run long authenticated stock audits in short resumable stages and persist reports and screenshots after each stage.

**Why:** The user explicitly requires that interruptions must not lose results. A single aggregate browser action also exceeded its 45-second limit and reset the notebook before observations were retained; a still-running outer job did not preserve those results.

**How to apply:** Reuse the existing browser test session; keep individual browser actions bounded (one navigation/reload at a time) and persist each route or short stage. Save action/endpoint/status/error and observed balances on failure, fix reproducible defects, and resume only the affected stage. Older automated results are not fresh browser evidence.

A stalled delegated browser session does not establish that the app or browser runtime is broken. Bounded local authenticated rendering checks can still succeed using the environment Chromium wrapper.

**Why:** A resumed session returned no traces, while a focused local check subsequently authenticated through the real session middleware and captured desktop/mobile screenshots without moving stock.

**How to apply:** Save the stall as missing evidence, not an application error. Keep any subsequent read-only rendering evidence separate from the uncompleted stock journey; do not count screenshots as transaction, export or offline-replay verification.

Verify disposable-database removal after stopping a supervised audit process; a terminated harness is not proof of cleanup.

**Why:** Both a workspace restart and a supervised SIGTERM left owned audit databases behind despite the harness having a cleanup handler.

**How to apply:** Check only the exact database names recorded for the current audit. If cleanup was interrupted, verify the strict disposable-name pattern and that each differs from the business database before removing it. Never sweep all similarly named databases.

Serial execution alone does not establish fixture isolation for company-wide assertions.

**Why:** A company-wide low-stock assertion has failed with extra products under one full-suite order while passing under another. A single successful run or a coincident production-code change does not establish that the contributing fixtures were cleaned up.

**How to apply:** Identify the extra projected identities in the disposable database and trace their owning fixtures before changing alert business logic or weakening assertions. Include retained status/ownership layers in cleanup investigations, not just physical batch rows.

Tests that intentionally compare all real physical stock before and after must run without other DB fixture suites changing the same database.

**Why:** An unrelated suite's temporary fixture changes look identical to unintended stock changes in a whole-database safety baseline. Parallel execution can produce false corruption failures.

**How to apply:** Preserve serial execution for DB safety suites. If optimizing unit-test speed, separate no-database tests rather than enabling file parallelism across a shared database.

Receipt tests must establish isolated original dispatch allocations and confirmed physical receipt evidence, with cumulative quantities explicit; a journal entry alone is not proof of goods received.

**Why:** Current balances project physical/status layers, so a standalone inward journal or an arbitrary first projection row can falsely appear to prove stock custody or conceal a double receipt.

**How to apply:** Use per-case products/lots/source and destination identities, assert exact summed fixture quantities and posted receipt events, check the source is not deducted again, and clean every mutable fixture register.

Concurrency regression tests must prove actual contention and cover both valid winner orders.

**Why:** Starting two requests with Promise.all does not guarantee their database transactions overlap; a sequential execution can falsely appear to validate a race safeguard.

**How to apply:** Control scheduling without mocking SQL results or handler behavior, verify the competing real database transaction is blocked by the winning row lock, release it, and await both requests before assertions and cleanup.

New reporting SQL needs a real read-only HTTP check against a guarded schema-only fixture, even after mocked unit tests pass.

**Why:** A new trace reader passed mocks but selected a branch column that did not exist; the actual captured branch was inside structured audit evidence. Empty real tables still validate SQL compatibility.

**How to apply:** For added report sources, inspect the writer/schema and exercise the GET through actual synthetic staff-session middleware. Mocks prove presentation and filtering intent, not schema compatibility.

Long-running disposable API processes can retain stale ESM exports after source changes; preserve their evidence but do not certify a new build from their runtime.

**Why:** A retained populated review server rejected a newly imported date helper while a fresh process reading the same data succeeded. Reseeding would destroy the retained history without fixing the cache issue.

**How to apply:** Verify current code with a fresh process over the owned review target; keep business GETs read-only and omit bootstrap/migrations when the pass forbids writes. Distinguish wrapper route gaps from real application failures.

Browser failure injection must affect the active logical read, and current-code claims need observations captured after the change.

**Why:** Development StrictMode issued duplicate mount reads: injecting503 into only the obsolete read while the current read returned200 correctly produced complete data, not an unavailable branch. A continuation also carried forward an older DOM observation after the markup had changed.

**How to apply:** For a failed-branch test, fail matching reads for that branch until the intentional Retry, then remove the interceptor. Do not weaken stale-response guards to retain an obsolete failure. Check observation timestamps and the served module before treating carried-forward DOM evidence as a new regression.

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

**Why:** Browser cookies are not port-scoped, and a synthetic GM token signed with an inherited business key could be accepted by another local service.

**How to apply:** Override signing keys only in the disposable child process; never print or persist them. Require recorded ownership for any cleanup.

Do not assume a generic database helper points at the database used by an isolated browser preview.

**Why:** A browser tester used a generic read-only helper without proving its target; those results could not be used as isolated-fixture evidence.

**How to apply:** Explicitly prohibit generic database helpers in isolated browser instructions. Use session-authenticated fixture APIs, or an ownership-checked harness connection, for fixture assertions.

Stopping a background fixture task can terminate its process group before asynchronous database cleanup finishes.

**Why:** The disposable browser harness stopped and its preview closed, but its owned database still existed and required a positively identified cleanup.

**How to apply:** Prefer a graceful signal to the ownership-verified harness and wait for its disposal marker. Verify deletion; remove only the exact fixture owned in the current session, never a stale or unverified manifest.

Optional Linux proc child-process listings may be absent even when the harness cmdline is readable.

**Why:** A cleanup precheck failed on a missing per-task children file although the ownership-verified harness was still running.

**How to apply:** Do not make safe disposal depend on that optional listing. Verify the exact manifest PID/cmdline, exact database identity and final listener closure; never substitute an unverified process or database sweep.

Canonical-only branch fixtures do not establish legacy-location coverage. Include a persisted legacy branch alias with a held or reserved unit when validating stock-report agreement.

**Why:** Different report reads can normalize owner names at different stages: available inventory can be positive while a canonical-only physical projection returns zero. Ordinary canonical lifecycle fixtures miss this failure.

**How to apply:** Verify canonical and authorized legacy-alias requests produce the same owned, available, held and original-cost totals, without treating warehouse aliases as branch owners.

A backup recovery drill does not broaden a test process's database authority.

**Why:** A second owned database restored successfully, but the original process correctly rejected it because its guard was bound to a different exact target. Restore-command success alone did not establish recovered-row agreement.

**How to apply:** Keep independent exact-target guard contexts for recovery verification and retain the comparison result. Never disable or widen isolation merely because another database has a synthetic-looking name.

Physical-stock fixture readiness does not establish POS catalogue or original-cost evidence readiness.

**Why:** A browser fixture had stock visible in batch screens but no matching price-list product, blocking sale staging. A different API fixture intentionally lacked original CIF despite having a current catalogue CIF; assuming the browser fixture's cost produced a false regression failure.

**How to apply:** Validate each disposable fixture's active catalogue and captured cost sources separately before staging. Never change business prices or fill missing original costs to satisfy a synthetic expectation.

Serial test files can still contaminate whole-company baselines through retained fixtures. A database-template clone also needs server-side connection drain, not only a client pool-close acknowledgement.

**Why:** The combined suite included other fixtures' legitimate clients, and a template clone intermittently failed immediately after the pool had closed.

**How to apply:** Use independent owned databases for whole-scope suites. Drain only the exact owned template from a separate control connection; never sweep development/production sessions or reuse stale test-result JSON after a harness failure.

Concurrent fixture processes must not share mutable ownership/cleanup result
filenames as their sole evidence.

**Why:** Another run's successful cleanup marker masked an interrupted browser
fixture whose recorded local PostgreSQL cluster was still running.

**How to apply:** Journal ownership before provisioning under unique run IDs,
retain per-run cleanup, and verify the exact owned directory/PID is absent.
Aggregate reports only after matching ownership, rather than trusting the latest
shared cleanup file. Do not sweep ambiguous older disposable names.
