---
name: Received cost precision
description: Why carton-derived costs and same-lot physical merges require exact cost layers.
---

Keep per-base-unit received costs at full numeric precision and round only monetary totals. Keep multiple received source layers distinct even when physical storage merges an identical product/lot/expiry.

**Why:** Dividing an invoice carton cost or allocating a cent across many units often produces fractional cents. Rounding unit costs changes the original invoice total; collapsing mixed sources changes sale costs and wrongly attributes goods to a supplier.

**How to apply:** New receipts and movements retain exact costs; dispatch/receipt/sale snapshots retain immutable source layers. Unknown historical provenance stays unknown. Read-only projections may be rebuilt, but migrations must not infer or rewrite historical physical quantities.

## Projection reuse and filtering

Reuse current physical-cost projections only within a stable transaction snapshot, after the relevant physical writes. Do not use process-wide or time-based caches for balance correctness.

**Why:** Receipts, reservations, segregation and sales change physical source layers independently of historical movement discovery. A stale source projection can overwrite a correct balance even when the projection itself is read-only.

**How to apply:** Share a snapshot for a bulk rebuild; regenerate after physical changes. Full-scope report totals and missing-evidence warnings must not be computed from just the displayed detail page.

Cumulative receipt quantities must be consumed in allocation order before narrowing a transfer line to a selected product/source.

**Why:** A line's received quantity is cumulative, not per cost layer. Removing earlier allocations makes receipts get subtracted from later layers incorrectly; historical source names can differ.

**How to apply:** Include all allocations of a matching line for entitlement accounting, then filter the projected results. Never fix this by rewriting physical quantities or source names.
