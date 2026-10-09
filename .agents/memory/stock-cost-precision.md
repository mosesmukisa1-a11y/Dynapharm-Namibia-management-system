---
name: Received cost precision
description: Why carton-derived costs and same-lot physical merges require exact cost layers.
---

Keep per-base-unit received costs at full numeric precision and round only monetary totals. Keep multiple received source layers distinct even when physical storage merges an identical product/lot/expiry.

**Why:** Dividing an invoice carton cost or allocating a cent across many units often produces fractional cents. Rounding unit costs changes the original invoice total; collapsing mixed sources changes sale costs and wrongly attributes goods to a supplier.

**How to apply:** New receipts and movements retain exact costs; dispatch/receipt/sale snapshots retain immutable source layers. Unknown historical provenance stays unknown. Read-only projections may be rebuilt, but migrations must not infer or rewrite historical physical quantities.
