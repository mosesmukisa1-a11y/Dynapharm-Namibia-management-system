---
name: Historical sale repair authority
description: Operator-only authorization boundary for historical sale evidence repair
---

Historical sale repair is limited to code fixes and read-only review unless an
authorized operator separately approves a fresh canonical plan on the confirmed
primary database and verifies a restorable backup of that exact target.
Replica-derived hashes are review evidence, never apply approval values.

**Why:** The user explicitly chose to finish code fixes and read-only review
only, deferring production apply. Completing or merging that work must not be
interpreted as approval to change live historical records.

**How to apply:** Keep the operator's approval tied to the exact plan, source and
database fingerprints and backup verification. Preserve unresolved original
linkage gaps; do not infer branch mirror IDs, prescription sessions or prices.
The reviewed Windhoek CBD prescription lacks original allocation/completion
linkage and remains ineligible unless new exact original evidence is established.
