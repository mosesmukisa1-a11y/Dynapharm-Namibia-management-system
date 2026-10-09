---
name: Workflow listener ownership
description: Distinguishing a healthy managed server from an orphan listener after workflow restarts.
---

A workflow reported as running does not necessarily own the intended listening port. In this environment, restarting workflows during browser-test preparation has left older server processes alive: the new API could not bind and the new Vite process silently selected another port.

**Why:** A preview can continue to look healthy while requests reach an older, unmanaged process. Further blind restarts create more duplicates rather than proving the current application is serving.

**How to apply:** Compare managed open ports with process ownership when logs report address-in-use or a fallback port. Remove only positively identified stale application processes, then restart the existing managed workflows; do not create additional server workflows.
