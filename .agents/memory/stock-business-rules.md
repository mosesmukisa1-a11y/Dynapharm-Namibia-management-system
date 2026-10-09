---
name: Approved stock business rules
description: Business rules approved for the incremental stock-management repair.
---

The user approved these rules on 2026-10-09: reserve at approval, deduct once at dispatch, staff-confirmed receipt, cumulative partial receipts; Stock Manager acceptance of saleable returns; expired/damaged returns segregated; stock saleable through its expiry date; missing expiries flagged; original batch cost for valuation/profit; import expenses allocated by purchase value; explicit product pack conversions; atomic submitted import receipts; GM-approved count differences.

**Why:** The lifecycle repair needs consistent business rules rather than assumptions that change financial reports or stock ownership.

**How to apply:** Implement incrementally in the existing database/application. Never guess pack factors or original costs. No automatic timeout receipt or startup stock additions. Preserve historical evidence; historical quantity corrections require a separate reviewed proposal and backup.
