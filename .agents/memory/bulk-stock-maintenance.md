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

Close owned disposable browser contexts/services before a production build when workspace memory is tight.

**Why:** A concurrent build stalled after transformation near the memory limit; releasing owned audit resources allowed the serial build to finish normally without dependency changes.

**How to apply:** Do not kill unrelated browser contexts or shared platform processes, and do not weaken test-database guards to bypass environment failures.
