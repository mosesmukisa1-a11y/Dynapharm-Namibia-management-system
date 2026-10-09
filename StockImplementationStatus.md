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

## Verification

- Five isolated database-backed suites pass 23 cases: rollback, nested transaction connection sharing, partial receipts, concurrent receipt adapters, return segregation/replay, stale campaign caches, reconciliation, reservation-release retries, dispatched-cancellation guards, wrong-lot reservation rejection and atomic import receipts.
- Production frontend build and syntax/diff checks pass. Build warnings concern existing large bundles/mixed dynamic imports, not failed compilation.
- Signed-in damaged-refund approval and anonymous rejection passed browser verification.
- Signed-in partial delivery verification passes, including a legacy branch alias: prior 3 + newly received 7 = cumulative 10. The dialog's minimum/maximum totals are 3/10, and the delivery closes only after receipt.
- Isolated browser fixtures/accounts are removed. The original stock-batch, branch-batch and warehouse-overlay rows, quantities and statuses match the saved baseline exactly.

## Remaining original scope

1. **Product units, landed costs and cost layers:** explicit pack factors/barcodes, purchase-value freight/duty allocation, preservation of actual source-layer allocations through all receipts/sales, expiry-aware balance keys, and consistent cost/profit/valuation reporting. Current legacy available/reserved counters and coarse batch projection are retained; these are not a completed on-hand/reserved/available redesign.
2. **Controlled operations:** reviewed physical-count sessions with GM-approved differences; supplier returns, inspection/quarantine disposition and expiry write-off screens; full linked sale/dispatch reversals with matching financial corrections. Blocking unsafe deletion is not a complete cancellation feature.
3. **Remaining integration:** remove misleading cache-only availability from every branch/report screen; migrate all older mutation/report paths and barcode/unit workflows to the approved rules; stable import receipt retry keys; per-request line caps for unlinked legacy receipts; complete discrepancy review/print integration.
4. **Historical reconciliation:** inventory drift investigation and a reviewed correction proposal/backups. No automatic fixes to existing physical quantities are authorized by this implementation approval.

Do not treat the full plan as complete or publish it as a fully reconciled stock system until the remaining workflows, reports and acceptance tests are implemented.
