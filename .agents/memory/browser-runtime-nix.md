---
name: Browser runtime on Nix
description: Avoid missing-library failures when running local Playwright checks.
---

Prefer the environment-provided Chromium wrapper when launching Playwright in
this Nix-based workspace.

**Why:** Downloading Playwright's bundled Chromium succeeds but does not supply
its Linux shared libraries. Launching it can fail with a missing `libglib` even
though the browser download completed. The environment's Chromium wrapper
already supplies compatible runtime dependencies.

**How to apply:** Discover the current wrapper with `which chromium`, then pass
that path as Playwright's `executablePath`. Check availability each session
rather than treating an old path or browser revision as permanent.
