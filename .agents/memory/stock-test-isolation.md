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
