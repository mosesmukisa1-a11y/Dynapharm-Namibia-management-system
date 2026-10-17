---
name: Native failure evidence
description: Why stock release checks need real process, database-client and browser-network failures
---
Do not substitute adapter-injected errors for actual server/database disconnections or genuine browser offline replay.

**Why:** An isolated real database disconnect terminated the HTTP server despite passing adapter recovery tests: native connection error events continued outside the rejected query's promise. A real post-commit lost acknowledgment also exposed client queue handling that ordinary server idempotency tests did not exercise.

**How to apply:** For release gates involving uncertain transaction outcomes, preserve actual process/HTTP status, before/after business fingerprints, pending browser queue state and stable transaction identity across reconnect. Keep failing evidence alongside reruns. Server deduplication alone does not prove the client will actually replay an uncertain operation.

Stopping a background shell is not proof that its asynchronous cleanup finished.

**Why:** Stopping an owned test harness left its disposable database, private temporary auth file and child API behind after the parent had stopped.

**How to apply:** Verify database removal through the catalog and temporary-file removal explicitly. Before stopping an orphan, verify that its recorded PID owns the isolated listener, not the development or production listener. Remove only resources whose ownership and disposable scope are established.

Separate descriptor admission, actual driver success, authenticated HTTP behavior and browser behavior in SQL-boundary evidence.

**Why:** A passing aggregate suite and brand-admission trace can coexist with missing native family witnesses. Driver observers that watch promises alone also miss legitimate callback-based pool operations.

**How to apply:** Correlate admitted identities with successful native executions, covering callback and promise APIs without altering execution. Label representative family coverage separately from exhaustive business-branch coverage; retain original failures and affected reruns.
