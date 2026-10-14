---
name: Mixed stock history coverage
description: Central and branch stock histories can have different coverage within the same branch.
---
One central-ledger row is not evidence that a branch's entire older movement history is mirrored centrally.

**Why:** A stock audit exposed older branch receipts disappearing from reports once newer centrally posted activity existed. Current and legacy operations can coexist in one branch without sharing complete ledger coverage.

**How to apply:** Deduplicate proven mirrors by operation reference and product/lot evidence; retain unmatched history rather than suppressing all branch movements. Reservations and condition changes are not physical consumption. Missing history is not authority to manufacture physical stock or infer an opening baseline.

Movement-derived remaining quantity is a reconciliation subtotal, not authority to replace physical stock.

**Why:** The user requested a batch ledger equation while explicitly preserving historical records. Unknown openings, incomplete coverage and other condition movements can leave an unexplained difference.

**How to apply:** Show net recorded movements beside authoritative physical custody, plus the unexplained difference and bounded-history disclaimer. Never repair balances just to make the equation agree.

Legacy auto-received country-to-warehouse releases can retain their product and quantity on the transfer header while having no child item rows or allocation rows.

**Why:** A production zero-products display was caused by ignoring existing header evidence, even though matching posted transfer-out and receipt movements existed. Empty child tables did not mean the original transfer had zero units.

**How to apply:** Inspect headers and linked movement references before classifying these records as missing stock. Display existing evidence without backfilling item/allocation rows or inventing catalogue IDs, and do not treat the legacy auto-received flag as new staff-receipt verification.
