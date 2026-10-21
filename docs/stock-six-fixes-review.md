# Stock review follow-up — 21 October 2026

Base: security/emergency-startup-remediation-20261017 at e76bc9587785dff3e9b02f7057f8b08e0528b0ec.

## Results by requested area

| Area | Source changes and remaining evidence |
| --- | --- |
| Expiry/write-off anomalies | Expiry reports, dashboard insights and overview use Namibian calendar-day boundaries. Impossible/missing expiry evidence is flagged, depleted lots are excluded and expiry warnings request review. Write-off reason conflicts compare the Namibian business day. Recorded historical reasons are not rewritten. |
| Quantities and locations | Reconciliation retains movements between identical names in distinct warehouse/branch namespaces. Summary reports retain explicit location types. Low-stock quantities use available source layers rather than cached balances. Selected-branch aliases work in overview navigation. Signed counts remain necessary before correcting historical balances. |
| Product duplicates | Existing price-import review/reconcile workflow reviewed. It requires a fresh review token and explicit canonical identity, archives aliases, and retains history/dependent stock references. No duplicate group was merged: a current catalogue extract and identity review are absent here. Database-backed merge regression remains unverified in this environment. |
| Cost evidence | Overview cards use original-cost projection instead of today's catalogue price. Incomplete values are labelled known subtotals; unknown expiry-risk valuation is null. No supplier cost or opening stock was invented. Missing original invoices/import expense allocations still require documentary restoration through the existing controlled workflow. |
| Reorder/dashboard logic | Command Center and Smart Reorder use the server's allocated-sales evidence and available branch stock. Removed the unsupported 180-unit/six-month order calculation and quantity prefill. Zero-demand/zero-available stock is explicitly out of stock. Failed data reads show retryable errors. Older branch responses cannot overwrite a newer selection. |
| Navigation | Shared branch aliases preserve selected-location totals without including warehouse namespaces. Existing portal URL navigation remains. The new screen tests cover branch changes, stale responses, failure/retry and manually entered order quantities. Full live route-by-route/browser/printing verification was not performed. |

## Validation and boundaries

- Lockfile install completed with dependency lifecycle scripts disabled.
- Unit suite and production bundle results are recorded in the implementation commit description/final handoff.
- The normal build identity checks were retained. A local source-hashed archive/binding was generated to build the changed source; it is not a release approval.
- Full clean-gate packaging is blocked by missing inherited SQL audit inventory. No historical audit inventory was fabricated.
- The repository's isolated database runner was attempted. It could not start because PostgreSQL tools (`initdb`/`pg_ctl`) are unavailable. No live database URL or data was used. Duplicate merge, write-off transaction and cost-layer database regressions are therefore NOT VERIFIED here.
- No production migration, data repair, deployment, scheduler activation or Replit pull was performed. Before release, run database suites in a clean PostgreSQL environment, review current source evidence and complete authenticated stock UI verification.

Overall: software corrections implemented; historical data reconciliation and complete database/UI verification remain PARTIALLY VERIFIED.
