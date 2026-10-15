---
name: Code-only publication safety
description: Production checkpoint and startup side-effect gates required for narrowly authorized code-only releases.
---

A code-only publication must stop unless the actual healthy production source checkpoint and code-only recovery are established, and startup cannot run unauthorized migrations, seeds, backfills or stock/financial automation.

**Why:** The user explicitly requires these as pre-publication gates. A frontend-only diff and successful public health check do not establish startup safety; a runtime version marker is not a reproducible source checkpoint.

**How to apply:** Compare the reviewed candidate with current HEAD, inspect both publishing commands and application startup side effects, and distinguish existing production automation from actions performed by the release. Do not substitute a pre-repair workspace checkpoint for the deployed source. If either gate fails, save a BLOCKED report and stop; obtaining a separate approval for startup-safety changes is not permission to repair production data or disable unrelated automation.

Keep legacy bootstrap as an indivisible lazy operation; code-only must be a hard boundary, including automatic price activation on otherwise read-only HTTP requests.

**Why:** The user requires unchanged default legacy behavior. Its schema/seeds/normalizations are coupled; selective legacy toggles can run repair logic against an unprepared schema. A health request also exposed automatic price activation beyond the obvious startup functions.

**How to apply:** Preserve existing legacy ordering/guards, reject permissive overrides in code-only, and verify actual isolated HTTP startup rather than policy booleans alone. This is startup safety, not permission to disable normal authorized staff business transactions.

An exact recovered legacy source snapshot is not automatically a zero-write-compatible production rollback target.

**Why:** Restoring source offline does not run its bootstrap; republishing it does. A snapshot predating startup controls can ignore a code-only setting and resume old mutations.

**How to apply:** Preserve the exact raw source and clearly separate any reviewed rollback candidate retaining safety controls. Never label offline restoration proof as a production no-write rollback rehearsal.
