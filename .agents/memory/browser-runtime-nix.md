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

When a login form disappears or a locator times out, inspect main-frame navigation before blaming authentication.

**Why:** First service-worker activation caused a reload between opening the staff login form and filling it during an isolated audit. Repeated selector changes did not address the underlying navigation race.

**How to apply:** Record navigation/controller events during diagnosis. Do not disable service workers to make a genuine offline/reconnect audit pass.

Offline replay verification must await the sync HTTP response and verify persisted transaction identity and balances, not merely an empty pending queue. Re-import queue helpers after navigation.

**Why:** A queue can become empty before the database observation is synchronized, and a genuine service-worker reload clears window globals without losing the persisted queued sale. Both caused misleading audit failures.

**How to apply:** Preserve failed evidence, capture response status/body, and test a repeat of the same offline identity without another deduction.
