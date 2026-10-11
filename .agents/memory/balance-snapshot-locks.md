---
name: Balance snapshot lock ordering
description: PostgreSQL snapshot timing and pooled advisory-lock cleanup during concurrent stock cache refreshes.
---
Wait for competing balance writers before establishing a repeatable-read snapshot. A SELECT which acquires a transaction advisory lock establishes its snapshot before the lock wait finishes.

**Why:** A waiting repeatable-read refresh can miss the previous refresh's newly committed balance row and insert another logical identity, despite apparently serializing its reads with advisory locking. The balance table's primary key alone does not enforce logical identity uniqueness.

**How to apply:** For standalone stable-snapshot refreshes, acquire the location session lock before BEGIN and release it after commit or rollback. Embedded read-committed writers must use the matching transaction lock before balance reads. Any future embedded repeatable-read writer needs that lock before its own snapshot. Never return a potentially session-locked connection to the pool; destroy it if cleanup is uncertain, without retrying already committed work.

Lock normalization must match logical identity comparisons.

**Why:** Trimming IDs in duplicate checks but not advisory keys allows whitespace variants to hold different locks. Both transactions can then insert and see only their own row, passing even a post-insert duplicate check.

**How to apply:** Normalize case and surrounding whitespace consistently in location locks and balance lookups. Test actual lock contention with variant spellings; preserve the existing stored identity rather than silently renaming or deleting historical rows.
