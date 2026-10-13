---
name: Bulk stock maintenance
description: Safety and operating tradeoffs for reviewed bulk branch clearances
---

Bulk stock clearance is an operator-confirmed maintenance action, not permission for an agent to post production SQL outside the staff workflow. The operator must attest to a recoverable backup; a preview, source extract or before-image is not itself that backup.

**Why:** The user authorized a reviewed branch-only clearance with product-family exceptions and historical retention, to execute through their own staff login.

**How to apply:** Preserve the one-off approved exceptions recorded in the stock business rules. Keep actual live execution separate from preparing or publishing the tool.

Freezing the relevant inventory/registry predicates during execution is intentional, even though other stock writes briefly pause. Row-only locks do not protect new receipts or newly registered branches. Saved scopes must display the exact stored identities rather than revert visually to an all-branch selector.

**Why:** A bulk operation can otherwise report success while silently leaving newly added non-exempt stock or misrepresent which branches were affected. Signed role claims can also outlive current staff authorization.

**How to apply:** Preserve exact typed branch identities, recheck current staff authority, reject stale previews and maintain deterministic retry identity. Replace broad maintenance locks only with demonstrated equivalent predicate protection, not client-side totals.

Explain unmet clearance requirements next to the confirmation button, not only above a long batch table. A row saying “No detected blocker” is not an all-preview clearance, and an empty stock-edit queue does not mean there are no pending write-offs.

**Why:** An operator supplied correctly typed/ticked confirmation screenshots but could not see the aggregate blockers after scrolling, making the functioning safety gate appear broken.

**How to apply:** Keep blocking details and exact request/batch identities visible near execution. Do not infer which recorded quantity/status is wrong or resolve production blockers without reviewed authority.

Close owned disposable browser contexts/services before a production build when workspace memory is tight.

**Why:** A concurrent build stalled after transformation near the memory limit; releasing owned audit resources allowed the serial build to finish normally without dependency changes.

**How to apply:** Do not kill unrelated browser contexts or shared platform processes, and do not weaken test-database guards to bypass environment failures.
