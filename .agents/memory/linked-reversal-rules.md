---
name: Linked return and replacement authorization
description: Conservative treatment of physical returns, historical ambiguity and prescription replacements.
---

A physical return does not erase the original issue or reopen its prescription entitlement. Replacement dispensing needs a new prescription authorization; campaign freebies must be justified by the linked paid issue.

**Why:** Returning goods changes custody and creates new financial evidence, not permission to issue the same prescription again. Otherwise a refund followed by re-dispensing can bypass quantity limits.

**How to apply:** Keep original issues in entitlement totals even after their returns. Separate free campaign companions from prescribed paid quantities.

Unlinked historical refunds need separately reviewed original-sale evidence. A currently matching product/lot is not proof of its original supplier, cost or expiry; approved unlinked refunds must conservatively consume the original lot's refund cap.

**Why:** Identical physical lots can contain different received supplier/cost layers. Assigning historical returns to today's remaining layer creates false supplier credits and permits duplicate refunds.

**How to apply:** Block ambiguous approvals rather than fabricating allocations. A missing original available batch goes to segregation; use the existing GM-reviewed release workflow instead of automatically creating saleable stock.

Historical linking requires a Stock proposal and a separate GM reviewer; evidence approval alone cannot confirm custody, alter requested quantities/prices, approve the refund, or move stock. Reject multiple matching allocations and mixed source identities.

**Why:** A historical evidence review is not proof that goods are physically present, and choosing a convenient current or mixed source would create false supplier/cost evidence.

**How to apply:** Preserve the original request and frozen sale evidence immutably, recheck their fingerprints and shared caps before approval, leave missing receipt fields unknown, and conservatively count approved unlinked same-lot refunds even when their sale reference is missing.

Approval audit identities must come from the verified principal contract, not an assumed UI-profile shape, and remain stable when roles change.

**Why:** Authentication claims and user profiles are different data contracts. Confusing them can block legitimate writes or misidentify the proposer and reviewer.

**How to apply:** Resolve the verified actor consistently for proposals, reviews and immutable audit records; role/display-name changes must not create a different identity.

Goods already received by a branch return through a new branch-to-source transfer, not through cancellation of the original outbound transit.

**Why:** The original transit is no longer their custodian, and restoring its source would leave the same goods available in both places.

**How to apply:** Transit returns share allocation caps and serialization with receipts; only unreceived, physically returned quantities qualify.

Reverse every source register affected by reservation, not just physical batch availability. Non-saleable physical returns release the outgoing reservation count but remain unavailable in segregation.

**Why:** A return can leave physical stock correct while the warehouse register still understates it, or leave goods both held and recorded as dispatched.

**How to apply:** Assert both source registers and outgoing counters for saleable and segregated returns. Do not create or guess a historical warehouse lot when existing register evidence is ambiguous.

A later inspection release of returned warehouse goods changes availability, not dispatch custody. Preserve unrelated reservations and use the original source location kind rather than assuming all customer-return segregation belongs to a branch.

**Why:** The physical-return event already released the outgoing count. Clearing it again during inspection can erase a later reservation; treating the shared return category as a branch creates stock at the wrong location.

**How to apply:** Credit the original available source and its secondary register after inspection, leaving gross received quantity and outgoing counters unchanged.
