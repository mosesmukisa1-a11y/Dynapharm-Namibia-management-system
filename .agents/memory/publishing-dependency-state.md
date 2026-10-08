---
name: Publishing dependency state
description: Distinguishing stale dependency installation failures from application build and security failures.
---

Treat npm ENOTEMPTY rename errors during publishing as generated dependency-tree conflicts, not application compilation errors. Preserve the lockfile and patched dependency versions when rebuilding the dependency folder.

**Why:** Publishing has failed during installation after dependency upgrades even though the source builds successfully; an earlier attempt was separately blocked by a critical dependency advisory.

**How to apply:** Inspect the latest publishing attempt rather than assuming a previous error is still active. Reinstall into a clean generated dependency directory, verify the production build, and restart development workflows so they do not retain modules from the old installation.
