---
name: Read-only reconciliation extraction
description: Production SQL output limits and keeping location namespaces distinct in stock comparisons.
---

Large single-cell production SQL results can be removed entirely by an output cap around 1 MiB: success may return just a header and a truncation marker, not parseable JSON.

**Why:** Read-only stock snapshots can include much more historical movement/source evidence than fits in one tool response. A successful query is not proof that its entire result arrived.

**How to apply:** Inspect sizes first, narrow or aggregate unnecessary detail, and extract bounded parts with a consistent whole-snapshot fingerprint. Reject mismatched fingerprints or truncation rather than publishing a partial dataset as complete.

Location type is part of stock identity. Normalize branch aliases only within the branch namespace; a warehouse identifier can coincide with an old branch alias.

**Why:** Globally normalizing a shared Windhoek name can merge warehouse and branch groups, conceal differences, or expose warehouse stock to branch-scoped viewers.

**How to apply:** Retain typed locations in comparisons and authorization. Unknown historical location types remain review evidence, not an excuse to infer ownership or rewrite balances.
