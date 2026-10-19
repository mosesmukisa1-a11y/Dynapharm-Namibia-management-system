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

Build source-scanner negative controls at runtime; do not whitelist test files.

**Why:** A source scanner also scans its own test source. Writing a credential-
shaped assignment inside a string-building test can recreate the very finding
being removed, even when no authentic credential exists. Separately, markers,
reserved hosts and random suffixes do not establish a literal's provenance.

**How to apply:** Generate public test-mode-only canaries without retained inputs;
preserve ownership/TLS/path checks when replacing fixture URLs. Prove that the
equivalent assembled hardcoded expression is still detected. For syntax-spanning
false positives, require exact expression structure and adjacent-real-assignment
negative tests, not a nearby keyword or filename exemption.
