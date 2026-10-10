---
name: Received cost precision
description: Why carton-derived costs and same-lot physical merges require exact cost layers.
---

Keep per-base-unit received costs at full numeric precision and round only monetary totals. Keep multiple received source layers distinct even when physical storage merges an identical product/lot/expiry.

**Why:** Dividing an invoice carton cost or allocating a cent across many units often produces fractional cents. Rounding unit costs changes the original invoice total; collapsing mixed sources changes sale costs and wrongly attributes goods to a supplier.

**How to apply:** New receipts and movements retain exact costs; dispatch/receipt/sale snapshots retain immutable source layers. Unknown historical provenance stays unknown. Read-only projections may be rebuilt, but migrations must not infer or rewrite historical physical quantities.

## Audit exports and completeness

Export stored decimals as strings, distinguish original received-unit precision from the frozen sale-accounting unit cost, and prefer a frozen actual revenue total over multiplying a fractional revenue unit. Separate matched cost/revenue profit from complete-source audit profit.

**Why:** Unit division can introduce differences from the actual saved receipt amount. Known monetary values alone do not establish import, expiry or allocated-expense provenance; spreadsheet autoformatting can also change exact identifiers and decimals.

**How to apply:** Never join current prices or surviving physical lots to fill historical export gaps. Keep unknown evidence explicit and source receipt totals nonadditive across sale layers. Downloads use the last loaded report scope, retain its authorization, and reject oversized exports explicitly rather than silently truncating.

Preserve received NUMERIC strings before creating any Number-valued accounting snapshot, including across warehouse relocations. Allocate a sold layer's import expenses using the original frozen import quantity, not a partial warehouse/branch receipt quantity.

**Why:** JSON cannot recover decimal digits after Number conversion, and a relocated subset is not the denominator of the original import expense allocation. Tests with hand-built string snapshots do not prove this production path.

**How to apply:** Verify actual import → partial warehouse receipt → branch receipt → sale → download against the database NUMERIC text, and retain the original frozen receipt lineage independently of the consumed physical batch.

## Projection reuse and filtering

Reuse current physical-cost projections only within a stable transaction snapshot, after the relevant physical writes. Do not use process-wide or time-based caches for balance correctness.

**Why:** Receipts, reservations, segregation and sales change physical source layers independently of historical movement discovery. A stale source projection can overwrite a correct balance even when the projection itself is read-only.

**How to apply:** Share a snapshot for a bulk rebuild; regenerate after physical changes. Full-scope report totals and missing-evidence warnings must not be computed from just the displayed detail page.

Cumulative receipt quantities must be consumed in allocation order before narrowing a transfer line to a selected product/source.

**Why:** A line's received quantity is cumulative, not per cost layer. Removing earlier allocations makes receipts get subtracted from later layers incorrectly; historical source names can differ.

**How to apply:** Include all allocations of a matching line for entitlement accounting, then filter the projected results. Never fix this by rewriting physical quantities or source names.

## Financial bases and returns

Keep charged customer revenue, commercial DP after the original recorded discount, and received CIF/DPC as distinct bases. Reverse each return using its own original basis. Refund-only periods may legitimately have negative net sales.

**Why:** Subtracting consumer-price refunds from DP-valued sales produces inconsistent income. Original member/online receipts and retail DP discount evidence can differ from a received stock layer's DPC; neither today's catalogue prices nor zero-clamping can correct that mismatch.

**How to apply:** Define the basis in labels/exports, preserve original charge totals, and reverse original returned CIF separately from damaged-stock write-off expense. Disclose unmatched receipts and incomplete evidence before calling known subtotals full totals.
