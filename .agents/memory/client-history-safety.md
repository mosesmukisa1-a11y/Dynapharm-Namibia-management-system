---
name: Client history safety boundaries
description: Front Desk off-system form filing only; existing prescription ordering must remain unchanged.
---

Retrospective outreach, paper and outage records must not invent appointments, clinical approval, stock deductions, sales, payments, BV or profit. Membership and email are optional; keep the existing shared client identity and never merge clients by name.

The user subsequently authorized an assigned-branch pending-fulfilment workflow: show historical prescribed/dispensed/pending quantities to that branch without posting stock, and reduce stock only when staff actually issue pending medicines.

**Why:** Historical filing is reference evidence, while a later physical issue is a new stock event.

**How to apply:** This is a narrow exception to the original historical-only scope below. Never deduct the already-dispensed historical quantities again. Keep new physical dispensing distinct and capped by remaining entitlement. Payment treatment for later issues must be established before implementing financial posting.

Pending medicines are always paid for when collected (user-confirmed).

Consultant check-up forms must automatically feed the Consultant Clients tab.

**Why:** The user reported that check-up patients were missing from Clients and requested harmonized records.

**How to apply:** Preserve registered profiles and original forms; use explicit source/reference evidence rather than name-only identity merges. This synchronization is not a prescription, payment or stock action.

**Why:** The user selected pay-on-issue rather than supporting prepaid off-system balances.

**How to apply:** Historical capture never posts revenue or stock. Each later physical issue uses current eligible prices, confirmed payment, atomic stock/payment posting and retry-safe remaining-quantity limits.

**Why:** The user needs records of work already performed outside the system, not a second stock/accounting transaction or an implied clinical decision.

**How to apply:** Keep actual service date and capture actor/time separate. Front Desk files existing off-system forms without a new Consultant approval pipeline; recorded prescriber is source attribution, not electronic approval. Consultants have authorized read-only visibility. Keep prescribed/already-dispensed quantities as historical transcription only and preserve originals through amendment snapshots.

The user corrected the scope: “the only change I asked for is the front desk to add off-system prescription forms; the original prescription order was fine.”

Admin must also be able to file and view these forms while using the existing Front Desk portal.

Off-system forms should use the same medicine picker as Consultants, with manual transcription retained for older medicines absent from today's catalogue.

**Why:** The user wants staff to select the prescribed medicines rather than retype their names.

**How to apply:** Reuse selection presentation only; historical selection does not authorize an order or dispensing and must not inherit stock/pricing mutations.

**Why:** The user uses an Admin login for Front Desk registration; accepting registration but rejecting that same client's history breaks the intended workflow.

**How to apply:** Preserve the real Admin session actor and existing cross-branch Admin permissions, scoped to a selected persisted client. Do not infer extra permissions for unrelated roles from their ability to open a portal.

**Why:** The earlier expansion into prescription authoring and live dispensing changed a workflow the user wanted to retain.

**How to apply:** Never create orders, payments, BV/profit, reservations or stock deductions through this profile. Leave original ordering, pricing, membership, payment and dispensing behavior unchanged. Do not delete earlier evidence when narrowing scope.

Tests must exercise actual login claims and real HTTP request contracts when composing handlers.

**Why:** Plain-object handler tests passed while real staff sessions and inherited Express headers failed during the authenticated browser flow.

**How to apply:** Use real session middleware for critical browser checks; do not assume sanitized frontend user fields or enumerable plain objects represent server requests.
