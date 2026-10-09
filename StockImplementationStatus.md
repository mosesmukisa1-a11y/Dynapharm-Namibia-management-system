# Stock implementation status

Date: 9 October 2026.

The proposed rules and incremental changes in Instructions.md were approved.
This is a safety-stage implementation, not completion of the full lifecycle plan.
Historical physical-stock quantities are not automatically repaired.

## Implemented safety changes

- Transfer mutations, receipt adapters, refund approval, import receipt, supplier-import mutations, manual branch inventory, branch sales/dispensing, warehouse receipt, and stock-adjustment approval use a shared transaction boundary. Legacy helper writes join the transaction; error responses roll back. Realtime events and balance refreshes are deferred until commit.
- Regular transfer receipts, barcode receipts and linked stock-request receipts share a locked receipt operation. Regular receipts are cumulative; barcode/request receipts are increments. Earlier actual receipt movements are recognized, partial receipts remain open, and quantities cannot exceed dispatched lines.
- Incoming partial transfers remain receivable on screen. The form explains cumulative totals, shows prior receipts, and constrains totals to prior received/dispatched quantities.
- Receipt history and physical batches recognize branch aliases. Batch creation uses a logical-key lock, including missing/null-expiry rows.
- Approval cannot reserve unavailable stock. GM approval and staff dispatch are required; small-quantity auto-dispatch and timeout auto-receipt are disabled. Overdue receipts generate reminders instead.
- New branch dispatches use explicit in-transit movements. Receipt clears transit instead of deducting the original warehouse twice. Consumed reservation markers are closed after dispatch.
- Approved reservation cancellation is serialized; dispatched/received records cannot be silently cancelled or deleted. Immediate manual branch-to-branch stock credit is blocked: use the transfer workflow.
- Refund approval locks the refund. Staff must classify saleable/damaged/expired/quarantine condition. Only saleable returns restore available physical stock; other returns are recorded in a segregated location. Expired stock cannot be marked saleable. Known original sale allocations cap cumulative returns, and original recorded prices replace live catalogue fallback.
- Campaign sales no longer recreate physical stock from cached balances. Branch walk-in, dispensing and campaign stock selection excludes expired/non-saleable batches through the Windhoek expiry date.
- Submitted import lines are atomic and reject non-finite/non-whole quantities. A later line failure rolls back earlier ledger and physical-batch writes.
- Manual branch writes record central movements as well as branch movements. Adjustment approval locks the target, uses current remaining quantity to derive the change, and refuses missing targets.
- Destructive posted walk-in sale deletion and stock-affecting edits are blocked pending a controlled reversal workflow.
- Startup's legacy automatic stock-quantity repairs are disabled. A physical-quantity baseline is saved under .local/stock-audit before additive schema/test changes.
- Reconciliation includes missing physical/cache/warehouse-overlay records. Two automation SQL column mismatches were corrected.
- Controlled physical-count sessions now save branch/warehouse cutoff quantities, require per-line counted base units and reasons, and let staff submit without posting stock. GM/admin review can approve or reject individual lines. Approval locks current physical batches and adds the approved cutoff difference rather than overwriting intervening sales or receipts. Overlapping open counts on the same batch are blocked.
- Supplier returns now support original import/batch/expiry/cost evidence, partial GM-approved quantities, segregated return holds, cumulative staff dispatch and supplier credit notes with expected versus actual credit and financial variance entries. No live-price fallback is used when original cost or supplier evidence is missing.
- Inspection/quarantine disposition is available in Stock, Branch and GM; saleable release and expiry/damage write-off need GM approval. Originally damaged/expired goods cannot be released as saleable. New non-saleable customer refunds create physical segregation records; historical quarantine movements are not silently converted into new physical stock.
- Finance can review supplier credits and the linked debit/credit journal. Depleted branch batch identities remain available for count cutoffs and original-return provenance.

## Verification

- Five isolated database-backed suites pass 23 cases: rollback, nested transaction connection sharing, partial receipts, concurrent receipt adapters, return segregation/replay, stale campaign caches, reconciliation, reservation-release retries, dispatched-cancellation guards, wrong-lot reservation rejection and atomic import receipts.
- Production frontend build and syntax/diff checks pass. Build warnings concern existing large bundles/mixed dynamic imports, not failed compilation.
- Signed-in damaged-refund approval and anonymous rejection passed browser verification.
- Signed-in partial delivery verification passes, including a legacy branch alias: prior 3 + newly received 7 = cumulative 10. The dialog's minimum/maximum totals are 3/10, and the delivery closes only after receipt.
- Isolated browser fixtures/accounts are removed. The original stock-batch, branch-batch and warehouse-overlay rows, quantities and statuses match the saved baseline exactly.
- Controlled-operation verification adds 22 isolated database cases and four UI contract cases, all passing. The combined targeted stock-safety/refund regression run passes 45 checks. Coverage includes GM-only review, partial line/quantity decisions, overlapping-count prevention, concurrent sales and supplier approvals, expiry-day release rules, original cost/identity checks, quarantine release/write-off, refund segregation and multi-import credits. Lifecycle regressions exercise real partial transfer receipts through supplier credit, ambiguous-source refusal, and GM release after a depleted source row was removed. They also prove that positive unlinked stock stays unlinked on receipt, quarantined and directly saleable refunds cannot acquire another import's provenance, and original sold expiry overrides a newer matching lot. The database suite checks original non-fixture branch/warehouse quantities and statuses after cleanup.
- Signed-in browser verification confirmed count submission/partial review, branch-only access and zero-quantity drafts, and cumulative supplier dispatch. It found an `awaiting_credit` UI status mismatch; this was corrected and covered by focused Finance UI tests, including selected-import submission, blank-amount rejection and actual journal account display. No second full browser pass was run.
- The full existing test suite still has seven failures in `tests/dispatch-note-cancellation.spec.js`: those older assertions expect already-dispatched transfers to be cancelled/rejected, while the existing controlled-reversal guard returns 409. The safety guard was not weakened by this feature.

## Remaining original scope

### Unit/cost verification

- Isolated database checks cover explicit carton factors, immutable retry payloads, concurrent receipt replay, purchase-value cent allocation, unknown versus explicit zero costs, carton receipt followed by a single-unit sale, same-lot mixed costs, cumulative partial receipts, exact cancellation restoration, country-to-warehouse expiry/cost splits and real GM approval/staff dispatch with expiry-aware reservation projections.
- Signed-in browser checks verified the actual pack editor, 24-unit receipt preview, a deliberately lost successful response followed by refresh and identical-key/payload replay, and unchanged received valuation after changing only fixture catalogue prices. Stock, scoped Branch, GM and Finance original-cost reports rendered with missing-cost warnings. The base-unit-factor API/editor mismatch found during testing is corrected and covered; expense summaries retain cents.
- Original-cost reporting has an explicit reporting-role allowlist, denies warehouse/unknown roles before loading financial data, and requires an assigned, selected branch for scoped roles. Direct handler authorization checks cover non-reporting roles, absent assignments, missing selection, cross-branch denial, authorized branch isolation and entitled company roles.
- Disposable browser fixtures/accounts were removed; pre-existing physical stock quantities/status remained unchanged. Production build and targeted stock-safety, controlled-operation, concurrency and UI contract checks pass. Older already-dispatched cancellation expectations remain a separate known test gap; no safety guard was weakened.

1. **Product units, landed costs and cost layers are implemented for new receipts and transactions:** explicit per-product pack factors/barcodes, atomic carton/base-unit conversion, durable receiving retry keys and immutable retry payloads, purchase-value freight/duty/other allocation with cent reconciliation, and frozen actual source batch/expiry/cost allocations through country/warehouse/branch transfers and branch sales/dispensing. Same-lot mixed costs are retained as separate layers, not overwritten. Additive exact-cost columns preserve fractional per-unit landed costs; currency rounding occurs at report totals. Physical batch quantities are not migrated.
2. **Controlled reversals:** full linked sale/dispatch reversals with matching financial corrections remain outstanding. Blocking unsafe deletion is not a complete cancellation feature. Historical quarantine evidence with missing original cost/batch links still needs a separately reviewed reconciliation; it is not automatically made available.
3. **Remaining integration outside the unit/cost deliverable:** per-request line caps for unlinked legacy receipts and complete discrepancy review/print integration. New valuation and original-cost profit views expose missing-cost/revenue warnings, include owned reservations and transit, and distinguish available/on-hand/reserved/quarantined/expired/in-transit quantities. Expiry-aware cache projections are versioned; branch availability no longer invents cache-only physical batches. Finance, MIS and stock valuation reports use received costs rather than current catalogue prices. Unprovable historical costs remain explicitly unknown.
4. **Historical reconciliation:** inventory drift investigation and a reviewed correction proposal/backups. No automatic fixes to existing physical quantities are authorized by this implementation approval.

Do not treat the full plan as complete or publish it as a fully reconciled stock system until the remaining workflows, reports and acceptance tests are implemented.
