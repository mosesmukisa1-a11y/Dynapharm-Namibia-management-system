## Exact staff-path coverage

Verify the actual staff controls and their posting paths, not only a canonical lifecycle fixture.

**Why:** A barcode sale/linked return and an available-stock adjustment can behave differently from the canonical sale/segregated-write-off path, even when the full isolated API suite passes. A cost-layer rejection is a safety signal, not permission to repair historical layers automatically.

**How to apply:** Keep per-stage UI references and expected/observed balances. Distinguish available-unit and held-unit write-offs, and report blocked returns, disabled exports and failed inventory loading explicitly rather than substituting another path or assuming zero/healthy stock.

---
name: Stock audit verification scope
description: Required independent evidence and honest overall stock-audit status.
---

Keep the overall stock audit PARTIALLY VERIFIED until outstanding areas have independent evidence. Report automated workflows, authenticated staff screens, alert settings, offline replay, financial screens/exports, production reconciliation and physical counts separately.

**Why:** The user explicitly rejected treating passing synthetic workflows as proof of production stock accuracy. Stored-balance and history differences can overlap and are not evidence of missing goods; absent projections are not proof of zero physical stock.

**How to apply:** Distinguish tests and screen observations from receipts, opening history and physical counts. Never describe queued work as done, invent missing source costs/opening quantities, or apply historical corrections without separate approval.
