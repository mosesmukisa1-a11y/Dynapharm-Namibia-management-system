---
name: Code-only publication safety
description: Production checkpoint and startup side-effect gates required for narrowly authorized code-only releases.
---

A code-only publication must stop unless the actual healthy production source checkpoint and code-only recovery are established, and startup cannot run unauthorized migrations, seeds, backfills or stock/financial automation.

**Why:** The user explicitly requires these as pre-publication gates. A frontend-only diff and successful public health check do not establish startup safety; a runtime version marker is not a reproducible source checkpoint.

**How to apply:** Compare the reviewed candidate with current HEAD, inspect both publishing commands and application startup side effects, and distinguish existing production automation from actions performed by the release. Do not substitute a pre-repair workspace checkpoint for the deployed source. If either gate fails, save a BLOCKED report and stop; obtaining a separate approval for startup-safety changes is not permission to repair production data or disable unrelated automation.

Keep legacy bootstrap as an indivisible lazy operation; code-only must be a hard boundary, including automatic price activation on otherwise read-only HTTP requests.

**Why:** Development legacy behavior remains coupled and must retain its ordering. The user subsequently required production to reject legacy/unset startup profiles and require all safety flags explicitly false. A health request also exposed automatic price activation beyond the obvious startup functions.

**How to apply:** Preserve development legacy ordering/guards, never permit a production fallback to it, reject permissive overrides in code-only, and verify isolated HTTP startup. Workers need separate explicit task/service authority. This is not permission to disable normal staff transactions or change live settings.

An exact recovered legacy source snapshot is not automatically a zero-write-compatible production rollback target.

**Why:** Restoring source offline does not run its bootstrap; republishing it does. A snapshot predating startup controls can ignore a code-only setting and resume old mutations.

**How to apply:** Preserve the exact raw source and clearly separate any reviewed rollback candidate retaining safety controls. Never label offline restoration proof as a production no-write rollback rehearsal.

A safe release smoke allowlist is endpoint- and mode-specific. Do not equate an HTTP GET, a code-only process, or a successful portal HTML response with a non-mutating browser workflow.

**Why:** Legacy read handlers can normalize persisted identity data, and portal scripts automatically request additional endpoints. Startup guards intentionally do not disable normal staff business transactions.

**How to apply:** Audit shared authentication/providers and page-initiated requests; exclude write-capable and unresolved reads. Label HTTP shell/API checks separately from rendered authenticated browser evidence, and do not expand a reviewed smoke allowlist implicitly.
