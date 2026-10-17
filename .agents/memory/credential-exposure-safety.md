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

Allow fresh password authentication on only the exact credential-login POST
routes even when an old session cookie has been revoked.

**Why:** A successful reset invalidated the owner's old session, but rejecting
that stale cookie before the password handler prevented using the new password.

**How to apply:** Keep current-session validation on business APIs and reset
authority. Test login from the invalidated browser context, not only an empty
context, alongside unaffected-account continuity and one-use temporary login.

Permission to use a managed read-only SQL route does not attest every mandatory
transport or session control.

**Why:** A narrowly authorized inspection retained explicit TLS and pre-query
timeout requirements, but the documented query interface exposed neither
per-session TLS attestation nor connection-startup timeout options.

**How to apply:** Recheck current interface capabilities before connecting.
When such proof is explicitly required, unknown means unverified, not disabled
or implicitly approved. Do not add a new probe or relax the controls without
authority; record zero access if capability preflight stops before invocation.
