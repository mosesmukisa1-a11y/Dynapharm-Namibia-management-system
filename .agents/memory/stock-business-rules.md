---
name: Approved stock business rules
description: Business rules approved for the incremental stock-management repair.
---

The user approved these rules on 2026-10-09: reserve at approval, deduct once at dispatch, staff-confirmed receipt, cumulative partial receipts; Stock Manager acceptance of saleable returns; expired/damaged returns segregated; stock saleable through its expiry date; missing expiries flagged; original batch cost for valuation/profit; import expenses allocated by purchase value; explicit product pack conversions; atomic submitted import receipts; GM-approved count differences.

**Why:** The lifecycle repair needs consistent business rules rather than assumptions that change financial reports or stock ownership.

**How to apply:** Implement incrementally in the existing database/application. Never guess pack factors or original costs. No automatic timeout receipt or startup stock additions. Preserve historical evidence; historical quantity corrections require a separate reviewed proposal and backup.

## Count cutoff and supplier-return policy

Counts represent the saved session cutoff. Approval applies the counted-minus-expected difference to current locked quantities, preserving intervening sales/receipts; it must never overwrite current stock with the old count. A negative result requires a recount. Supplier-return approval segregates an approved quantity; only actual dispatch removes it from total on-hand stock. Actual supplier credit notes remain separate from expected original-cost recovery.

**Why:** The original stock instructions require concurrency-safe count differences and distinct authorization, dispatch and financial-credit evidence. Availability and supplier receivables must not be inflated by treating authorization as physical dispatch or an expected credit as money already credited.

**How to apply:** Keep the same cutoff/difference policy in any future count entry points and reporting. Preserve source identity after depletion, and keep damaged/expired/quarantine quantities separate from saleable stock. Do not manufacture missing historical supplier or cost links.

For a new accepted customer return whose depleted destination no longer exists, only the GM-approved inspection/release command may recreate an empty available destination and move returned stock into it. Missing supplier identity remains missing; original sale-cost evidence is not proof of supplier identity.

**Why:** Restoring a destination for newly accepted physical goods is an expressly approved operational action, not authorization to backfill historical quantities or assign an arbitrary supplier credit.

**How to apply:** Keep destination creation inside the reviewed release transaction. Never attach a similarly named supplier layer just to make a return eligible for supplier credit.

Supplier origin is historical evidence, not the identity of the lot currently remaining. A receipt into positive unlinked stock must not assign all older units to the new import. Refunds need recorded original-sale allocations for supplier identity; a matching current lot or recorded sale cost alone is insufficient.

**Why:** Identical product/lot/expiry labels can occur across different imports. Assigning one source to a mixed row can issue supplier credits for another supplier's goods or for untraceable historical units.

**How to apply:** Keep unknown/mixed rows ineligible for supplier credit until distinct original layers are proved. Preserve original-sale evidence before depleted rows are reused or removed. Approved release may add saleable physical goods, but must not fabricate cost/import identity for the combined row.
