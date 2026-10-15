---
name: Native failure evidence
description: Why stock release checks need real process, database-client and browser-network failures
---
Do not substitute adapter-injected errors for actual server/database disconnections or genuine browser offline replay.

**Why:** An isolated real database disconnect terminated the HTTP server despite passing adapter recovery tests: native connection error events continued outside the rejected query's promise. A real post-commit lost acknowledgment also exposed client queue handling that ordinary server idempotency tests did not exercise.

**How to apply:** For release gates involving uncertain transaction outcomes, preserve actual process/HTTP status, before/after business fingerprints, pending browser queue state and stable transaction identity across reconnect. Keep failing evidence alongside reruns. Server deduplication alone does not prove the client will actually replay an uncertain operation.
