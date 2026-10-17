---
name: Credential exposure remediation boundaries
description: Source secrecy, safe audit evidence and controlled recovery after credential exposure.
---

Code-only startup is not credential-exposure remediation: remove committed
credential defaults from every shipped legacy client and helper, even if the
current startup policy makes the original seed unreachable.

**Why:** Runtime guards do not prevent public source delivery, Git-history
disclosure or later execution of a retained credential-bearing helper.

**How to apply:** Audit tracked source plus reachable history without printing
values. Inventory exposure separately from proving that an exposed credential
still authenticates. Never equate candidate repair with production rotation.

Use keyed, per-run fingerprints for low-entropy credential findings, and treat
raw removal diffs and historical archives as sensitive.

**Why:** Unsalted password digests can be dictionary attacked, while an ordinary
Git deletion diff still contains the removed secret. A clean current-source
scan does not sanitize retained history.

**How to apply:** Share only sanitized inventories. Keep historical cleanup,
production credential rotation and signing-secret rotation under separate
explicit authority; do not restore exposed credentials as a rollback.
