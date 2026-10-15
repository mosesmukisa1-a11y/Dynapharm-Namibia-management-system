---
name: Code-only publication safety
description: Production checkpoint and startup side-effect gates required for narrowly authorized code-only releases.
---

A code-only publication must stop unless the actual healthy production source checkpoint and code-only recovery are established, and startup cannot run unauthorized migrations, seeds, backfills or stock/financial automation.

**Why:** The user explicitly requires these as pre-publication gates. A frontend-only diff and successful public health check do not establish startup safety; a runtime version marker is not a reproducible source checkpoint.

**How to apply:** Compare the reviewed candidate with current HEAD, inspect both publishing commands and application startup side effects, and distinguish existing production automation from actions performed by the release. Do not substitute a pre-repair workspace checkpoint for the deployed source. If either gate fails, save a BLOCKED report and stop; obtaining a separate approval for startup-safety changes is not permission to repair production data or disable unrelated automation.
