---
name: Approved stock business rules
description: Business rules approved for the incremental stock-management repair.
---

The user approved these rules on 2026-10-09: reserve at approval, deduct once at dispatch, staff-confirmed receipt, cumulative partial receipts; Stock Manager acceptance of saleable returns; expired/damaged returns segregated; stock saleable through its expiry date; missing expiries flagged; original batch cost for valuation/profit; import expenses allocated by purchase value; explicit product pack conversions; atomic submitted import receipts; GM-approved count differences.

**Why:** The lifecycle repair needs consistent business rules rather than assumptions that change financial reports or stock ownership.

**How to apply:** Implement incrementally in the existing database/application. Never guess pack factors or original costs. No automatic timeout receipt or startup stock additions. Preserve historical evidence; historical quantity corrections require a separate reviewed proposal and backup.

## Commercial price corrections

Stock alert thresholds are warning policy, not reorder rules or authority to move stock.

**Why:** Staff requested configurable low-stock and expiry warnings while explicitly excluding automatic receipt and historical repair. Reusing warning values as automation triggers would change operational behavior without approval.

**How to apply:** Keep warning settings separate from reorder quantities, staff-confirmed receipts, and GM-controlled write-off approval.

A current price list is not authority to reprice historical sales or received stock. Catalogue identity reconciliation must preserve the original physical-stock and sale names as evidence, even when a canonical price-list description includes a product code.

**Why:** Today's DP/CIF cannot prove what a customer was charged or what a received layer cost. Keeping original row IDs alone is insufficient when historical evidence identifies goods by their original name; replacing those names would also discard source evidence.

**How to apply:** Require separate reviewed, backed-up historical corrections. Resolve preserved names to reviewed canonical commercial prices for current lookups rather than rewriting stock/sale evidence. Keep different codes, packs and unproved numeric-name variants separate.

## Count cutoff and supplier-return policy

Counts represent the saved session cutoff. Approval applies the counted-minus-expected difference to current locked quantities, preserving intervening sales/receipts; it must never overwrite current stock with the old count. A negative result requires a recount. Supplier-return approval segregates an approved quantity; only actual dispatch removes it from total on-hand stock. Actual supplier credit notes remain separate from expected original-cost recovery.

**Why:** The original stock instructions require concurrency-safe count differences and distinct authorization, dispatch and financial-credit evidence. Availability and supplier receivables must not be inflated by treating authorization as physical dispatch or an expected credit as money already credited.

**How to apply:** Keep the same cutoff/difference policy in any future count entry points and reporting. Preserve source identity after depletion, and keep damaged/expired/quarantine quantities separate from saleable stock. Do not manufacture missing historical supplier or cost links.

Stock-register searches, location filters and page changes affect batch discovery, not session membership. Already selected lines must remain visible and included in submission until the staff member explicitly removes them. Depleted physical batches remain selectable for counts.

**Why:** The user requires searches never to hide selected session lines. Treating a filtered result page as the whole session can silently omit counted batches, especially zero-stock discrepancies.

**How to apply:** Preserve this distinction in future register changes. A cross-location selection is not permission to access another branch: list totals, detail reads and submission must all retain branch authorization.

For a new accepted customer return whose depleted destination no longer exists, only the GM-approved inspection/release command may recreate an empty available destination and move returned stock into it. Missing supplier identity remains missing; original sale-cost evidence is not proof of supplier identity.

**Why:** Restoring a destination for newly accepted physical goods is an expressly approved operational action, not authorization to backfill historical quantities or assign an arbitrary supplier credit.

**How to apply:** Keep destination creation inside the reviewed release transaction. Never attach a similarly named supplier layer just to make a return eligible for supplier credit.

Supplier origin is historical evidence, not the identity of the lot currently remaining. A receipt into positive unlinked stock must not assign all older units to the new import. Refunds need recorded original-sale allocations for supplier identity; a matching current lot or recorded sale cost alone is insufficient.

**Why:** Identical product/lot/expiry labels can occur across different imports. Assigning one source to a mixed row can issue supplier credits for another supplier's goods or for untraceable historical units.

**How to apply:** Keep unknown/mixed rows ineligible for supplier credit until distinct original layers are proved. Preserve original-sale evidence before depleted rows are reused or removed. Approved release may add saleable physical goods, but must not fabricate cost/import identity for the combined row.

## Confirmed product terminology

The user confirmed that “herbal warisan maharani” refers to HERBA WARISAN MAHARANI and “dynaseronoa” refers to DYNA SERENOA tablets.

**Why:** These user-supplied spellings differed from the live catalogue and were explicitly confirmed during branch-clearance scope review.

**How to apply:** Use these as reviewed terminology when interpreting requests; preserve original product names/IDs. A one-off clearance exemption does not create a permanent ban on separately authorized future write-offs.

## Ordinary branch write-off review

Ordinary branch write-offs require GM review even when the submitting staff member has broad access. Submission is not physical deduction or a stock reservation; approval must recheck current stock. Existing historical write-offs are not retrospectively converted into pending requests.

**Why:** The user explicitly separated ordinary write-off review from the dedicated GM-confirmed clearance action and prohibited historical repairs.

**How to apply:** Keep client-supplied statuses from authorizing deductions. Preserve submission and approval actors separately, and leave an insufficient-stock request pending rather than recording a partial deduction as a full approval.
