# Stock management investigation and repair plan

**Review date:** 9 October 2026  
**Scope:** Existing import, warehouse, branch, sale, return, adjustment, expiry, barcode, valuation, and reporting code.  
**Deliverable:** Research and implementation instructions only. This review did not change application behavior, stock records, configuration, or database schema.

## 1. Executive assessment

The requested system is achievable with the existing application, but stock cannot yet be treated as consistently correct across every entry point.

Several transactional sale and receipt paths are already implemented. However, the application has multiple representations of the same stock:

- `stock_batches`: imported/country and warehouse batch stock.
- `warehouse_inventory`: an additional warehouse inventory representation.
- `branch_inventory_batches`: physical branch batch quantities.
- `branch_inventory_movements`: branch movement history.
- `stock_movements`: the central movement ledger.
- `inventory_balances`: balances derived from the central ledger.
- Sale, transfer, request, refund, adjustment, and financial records, plus precomputed reports.

Some handlers update these together; others update only a subset. Some commit document status before updating stock. Some treat a cached balance as authority for creating physical stock. Different receipt paths do not share the same duplicate protection or movement semantics.

Consequently, a branch can show different quantities depending on whether a screen uses batch rows, branch movements, central movements, or cached balances. Sequential duplicate checks and individual batch locks do not resolve all concurrent or cross-endpoint operations.

**Highest-priority findings:**

1. General transfer updates can commit status and item changes before the stock transaction.
2. Refund approval does not lock and revalidate the refund itself, and its central movement type is not counted as inward stock.
3. Campaign sales can recreate physical branch stock from a stale cached balance.
4. Manual branch receive, transfer, and adjustment handlers do not write the central stock ledger.
5. Barcode receipt uses movement semantics and reference IDs that differ from other receipt paths.
6. Background automatic receipt and startup historical “healing” can credit stock without the same protections as staff receipt.
7. Sale edits/deletions can alter sales history without corresponding stock and financial reversals.
8. The new warehouse reconciliation query refers to a nonexistent CTE column.

Do not apply a blanket balance reset or regenerate physical stock from approved transfer quantities. Historical discrepancies must be investigated and corrected through an approved, auditable process.

## 2. Evidence and limitations

### What was examined

The review traced API handlers, central stock calculations, inline server handlers and startup routines, database migrations, relevant portal components, and existing stock tests.

A development-database check was executed inside a transaction explicitly set to **READ ONLY**, with a statement timeout. It returned only aggregate counts:

| Representation | Rows | Negative quantity rows |
|---|---:|---:|
| Branch inventory batches | 3 | 0 |
| Stock batches | 1 | 0 |
| Inventory balances | 5 | 1 |

The ledger contained `received`, `reserved`, `transfer_in`, `transfer_out`, `walk_in_member_sale`, `walk_in_non_member_sale`, `warehouse_receipt`, and `write_off` movements.

The negative derived balance confirms a development-data inconsistency. These small row counts do **not** demonstrate production impact, identify its cause, or prove that the batch stores are physically correct.

### What was not performed

- No production database audit.
- No stock-changing requests, migrations, repairs, or server restarts for this investigation.
- No end-to-end browser testing or concurrency stress tests.
- No execution of database-backed stock tests, which create or modify fixtures.
- No verification against physical stock counts, supplier invoices, delivery notes, or customer-return evidence.
- No claim that every historical movement is recoverable from the current records.

“Confirmed” below means a defect is directly visible in the inspected code. Predicted consequences still need targeted reproduction tests. “Partial” means related functionality exists but does not establish the full requested workflow. “Not identified” is not proof that no external/manual business process exists.

## 3. Required stock rules

### Quantity and accounting

For each location, product, batch, expiry, and stock condition:

```text
Closing stock
  = Opening stock
  + Receipts
  + Transfers in
  + Saleable returns
  - Sales
  - Transfers out
  - Supplier returns
  - Write-offs
  + Positive adjustments
  - Negative adjustments
```

- Use one declared base unit for stock arithmetic. Convert boxes/cartons at transaction entry, preserving the entered unit and conversion factor.
- Opening stock needs an explicit, auditable baseline when historical ledger coverage is incomplete. It cannot be inferred safely from incomplete history alone.
- Available stock, reserved stock, quarantined/damaged stock, expired stock, and in-transit stock must be distinguishable.
- Reservation must not count as both physical consumption and a second dispatch deduction.
- Dispatch must move stock from source to transit; receipt must move it from transit to destination, using one consistent model.
- Internal transfers must not create or destroy company-owned units. Unreceived or damaged quantities must remain explained.
- A return becomes available only after its condition is accepted as saleable.
- Expired stock must not remain eligible for sale simply because expiry write-off approval is pending.
- Posted stock-changing transactions must be immutable except through linked reversals/corrections.

### Transaction and concurrency requirements

Each business operation must:

1. Authenticate the actor and verify role/location permissions.
2. Lock and reread the business document inside the transaction.
3. Validate the current state, line identities, quantities, destination, and remaining entitlement.
4. Lock the actual eligible source batches in a consistent order.
5. Persist actual batch allocations, not just the batch originally requested.
6. Update document state, physical stock, branch history, and central movements atomically.
7. Enforce a persistent unique operation/line identity so retries across endpoints cannot duplicate the effect.
8. Publish notifications only after commit; reliably retry external/secondary financial work if it cannot share the transaction.

Locking a batch row alone does not make a refund or receipt idempotent. A lock on a missing batch row does not serialize competing inserts.

## 4. Code and workflow map

Line references are orientation aids for the reviewed version and may shift during implementation.

### 4.1 Imports, orders, suppliers, and warehouse receiving

| Files / entry points | Role and observations |
|---|---|
| `api/supplier-imports.js`, POST handler | Creates supplier import records, stock batches, and central import movements. Writes are not one shared transaction. |
| `api/stock/import/receive.js`, receive handler | Receives import lines into country stock, posts ledger entries, and creates stock batches. Earlier lines can commit before a later line fails. |
| `api/stock/supplier-orders.js`, `api/stock/orders.js` | Order-related entry points to include when defining ordered versus received quantities and supplier traceability. |
| `api/stock/country-stock/release.js` | Creates country-stock distribution transfer and item records; actual allocation and receipt must remain coordinated. |
| `api/stock/warehouses/receive-stock.js` | Country-to-warehouse acceptance, source FEFO deductions, destination batches, ledger movements, and transfer receipt status. Uses a transaction for these stock writes; approval/status is checked before the transaction. |
| `api/stock-batches.js`, `normalizeBatch`, `upsertBatch` | Batch quantity, location, barcode, cost, import, and product metadata. Direct edits must not bypass stock accounting. |
| `migrations/010_create_stock_management_tables.sql`, `013_stock_enhancements.sql` | Warehouse/import-related schema and indexes. |
| `client/src/pages/portals/StockPortal.jsx` | Import/shipment, country stock, warehouse, distribution, and stock-management screens. |

Quantities, supplier/import references, batch numbers, expiry, and cost fields exist. A complete verified workflow for ordered/received/damaged/missing quantities and allocated freight/customs/other landed expenses was not identified.

### 4.2 Warehouse and branch distribution

| Files / functions | Role and observations |
|---|---|
| `api/stock/transfers.js` | General transfer creation, approval, dispatch, receipt, cancellation, and rejection. |
| `fefoDeductStockBatches`, `fefoDeductWarehouseInventory`, `fefoDeductBranchInventoryBatches` | Source stock deduction helpers; actual allocation splits must drive downstream movement identities. |
| `normalizeTransferItem`, `parseItems`, `enrichItemsWithBatchExpiry`, `replaceTransferItems`, `loadTransferItems` | Transfer-line normalization and persistence. |
| `createDispatchNote`, `listTransfers` | Dispatch documentation and transfer listing. |
| `api/stock/dispatch/confirm-receipt.js` | Barcode/dispatch-note receipt. Has an in-transaction transfer lock but uses different movement/reference conventions from general transfer receipt. |
| `api/stock/receive-request.js` | Branch request receipt with a locked request row, FEFO warehouse deduction, and branch credit. |
| `api/stock-requests.js`, distribution request handlers | Request creation and approval plumbing; requests are not equivalent to proof of physical receipt. |
| `api/services/stockAutomation.js`, `runAutoReceiveDispatched` | Automatically receives aged dispatched transfers. This is not the same as branch staff confirming receipt. |
| `client/src/pages/portals/BranchPortal.jsx`, `handleReceiveTransfer` | Branch receipt UI and related sale/inventory actions. |
| `StockPortal.jsx`, GM portal approval components | Warehouse dispatch and approval UI; must use the same state model as the backend. |

### 4.3 Branch stock, sales, cancellations, and refunds

| Files / functions | Role and observations |
|---|---|
| `api/branch/inventory.js`, `getInventoryByBranch` | Branch stock display combining physical batches and balance fallback. |
| `upsertInventoryBatch`, `setInventoryQuantity`, `recordMovement` | Physical branch changes and branch-only movement recording. |
| `handleReceive`, `handleTransfer`, `handleAdjustment` | Manual operations; no matching central-ledger write in these paths. |
| `api/branch/walkin-sales.js`, POST | Primary FEFO branch sale deduction; batch, branch movement, and central movement are written transactionally. |
| `api/branch/walkin-sales.js`, PUT/PATCH and DELETE | Direct sale-record update/deletion without stock or financial reversal. |
| `api/branch/campaign-sale.js`, `deductStock` | Campaign deductions; unsafe cached-balance stock creation fallback remains. |
| `api/branch/dispense.js` | Prescription dispensing with locked batch deductions and movements; report/financial updates occur separately. |
| `api/stock/refund-requests.js`, PATCH | Refund approval, batch restoration, movement history, and financial reversal. |
| `migrations/008_create_branch_inventory_tables.sql` | Branch batch/history schema and uniqueness conventions. |
| `server.js`, offline sale schema sync | Existing partial unique index for walk-in sale `offline_id`; preserve and test this protection. |

### 4.4 Returns, adjustments, counts, and expiry

| Files / functions | Role and observations |
|---|---|
| `api/stock-movements.js` | Generic stock movements, return handling, write-off/field-use paths, and approval deductions. Branch and warehouse write-off support exists here. |
| `api/stock/refund-requests.js` | Customer refund-related returns, but saleable versus segregated condition is inconsistent. |
| `api/stock/warehouses/windhoek/returns.js`, `ondangwa/returns.js` | Read/list wrappers, not evidence of a complete supplier-return lifecycle. |
| `server.js`, `/api/stock-adjustments/:id/approve` | Approved corrections; stock updates and audit movements are not one transaction. |
| `api/stock/edit-requests.js` | Legacy edit-request path; distinguish from the active StockPortal adjustment workflow. |
| `api/services/stockAutomation.js` | Expiry/write-off proposal and stock-alert automation. |
| `api/stock/warehouses/_warehouseHelper.js` | Warehouse display/availability helpers; filters include stored status, not uniformly actual expiry eligibility. |

A complete supplier-return authorization/dispatch/credit workflow and a structured physical stock-count workflow were not identified in the inspected code. They should be treated as feature work, not assumed to be fixed by changing balance arithmetic.

### 4.5 Products, barcodes, units, and reporting

| Files / functions | Role and observations |
|---|---|
| `api/products.js`, product-price/catalog tables | Product catalog and product-code identity. |
| `api/stock/barcode.js` | Looks up master product codes and stock-batch barcodes. |
| `client/src/components/BarcodeScanner.jsx`, `QRCameraScanner.jsx` | Scanner UI; confirm current paths before implementation if moved. |
| `api/services/stockEngine.js` | Ledger classification, posting, opening/movement/closing calculations, balance recomputation. |
| `postStockMovement`, `postStockMovementTx` | Standalone versus caller-transaction movement posting. Prefer the transaction variant within business operations. |
| `recomputeInventoryBalanceTx`, `recomputeInventoryBalance`, `recomputeLocationBalances`, `seedInventoryBalances` | Cached balance maintenance. |
| `api/branch/stock-summary.js`, `stock-card.js` | Branch summary and history. Includes branch/ledger fallback behavior requiring consistency tests. |
| `api/mis/stock-report.js` | MIS stock report; existing branch guards prevent some walk-in/BIM sales double counting. |
| `api/services/gmFinanceMisEngine.js` | `getLocationStockSummary`, `getLocationMovements`, `getBranchSalesRevenue`, `getCompanyStockSummary`, `getAllBranchesSalesRevenue`, `getCompanyStockValueDP`, `getWriteOffs`, `getStockAlerts`. |
| `api/reports/branch-sales/stock-formula.js` and neighboring report handlers | Sales/stock formulas, daily/monthly/product reporting. |
| `api/stock/reports/` | Summary, company, branch stock, movement, expiry, low-stock, and precomputed report handlers. |
| `api/stock/valuation.js`, valuation location/product handlers, finance stock-value handlers | Stock valuation; fallback catalog pricing must not silently substitute for actual historical cost. |
| `api/services/stockScheduler.js` | Precomputed report refreshes. |
| `api/admin/stock-reconciliation.js` | Cross-store reconciliation; warehouse SQL currently fails on a bad column reference. |
| `client/src/pages/portals/AdminPortal.jsx` | Reconciliation screen. |
| `client/src/lib/api.js` | UI API mappings to include in endpoint consolidation. |

Product codes and batch barcodes exist. `carton_no` is not a unit-conversion factor. No complete base-unit/pack-size/conversion workflow was identified. Movement identity still often relies on normalized product names rather than stable product IDs.

## 5. Confirmed defects and risks

### P0-1. Transfer status commits outside the stock transaction

**Evidence:** `api/stock/transfers.js`, general PUT/PATCH flow around lines 988–1190. It reads prior status, updates `stock_transfers` around line 1108, and replaces items before beginning the stock transaction.

**Effect:** A stock failure can leave a transfer with a committed new status or changed items but incomplete stock effects. Concurrent callers can act on the same stale previous status. The later receipt advisory lock cannot undo the earlier independent commits.

**Repair:** Lock the transfer first inside one transaction. Reread state and approved allocations, authorize the transition, and persist status/items/reservation/stock/movements together. Use a common business-operation identity across all receipt routes.

### P0-2. Receipt paths do not agree on source deduction or identity

**Evidence:** `api/stock/dispatch/confirm-receipt.js` locks the transfer but posts `branch_receipt` with a hardcoded warehouse source and `reference_id = dispatchNoteId`. General transfer receipt uses `transfer_in` tied to the transfer. `stockEngine.js` classifies `branch_receipt` as both destination inward and source outward.

**Effect:** For a transfer whose dispatch already posts `transfer_out`, barcode receipt can count a second source outward movement. General duplicate detection looks for transfer-ID `transfer_in`, so it does not represent a universal receipt identity.

**Repair:** Define dispatch→transit and transit→destination postings once. Reference a canonical transfer and receipt event; preserve dispatch-note ID as additional traceability, not a competing idempotency identity. Route barcode, general, request, and automatic paths through the same validated command.

### P0-3. Refund approval can repeat, and the engine ignores its credit

**Evidence:** `api/stock/refund-requests.js` checks pending status before the transaction, then locks a branch batch rather than the refund. Two approvals can each increment stock. It posts `refund_return`; `api/services/stockEngine.js` does not include that type in `INWARD_TYPES`.

**Effect:** Physical batch quantity can be credited twice, while the derived ledger balance does not recognize even one credit. Batch locking alone is not refund-level duplicate protection.

The response says returned stock is held separately/not restored to saleable stock, while the code restores an `in_stock` batch. Financial/profit reversal work also extends beyond the stock transaction.

**Repair:** Lock and reread the refund, enforce pending→approved once, cap cumulative returns against the original sale allocation, and record condition/disposition. Count saleable return movements consistently; quarantine other returns. Make financial effects atomic or persist reliable post-commit work.

### P0-4. Campaign sales can recreate exhausted stock

**Evidence:** `api/branch/campaign-sale.js`, `deductStock`, around lines 54–168. Exhausted physical batches are deleted. The fallback reads positive `inventory_balances` and inserts a physical branch batch from that cached quantity when no matching physical row remains.

**Effect:** A stale balance can recreate stock already consumed by this or another sale. Updating an existing locked row does not fix the missing-row recreation case.

**Repair:** Remove cache-to-physical creation from sale processing. Sell only locked eligible physical allocations. Any legacy backfill must be a separate approved, repeat-safe migration supported by reconciled evidence.

### P0-5. Manual branch operations bypass the central ledger and source locks

**Evidence:** `api/branch/inventory.js`, `handleReceive`, `handleTransfer`, `handleAdjustment`, and `recordMovement`. These paths write branch batches/BIM but not matching `stock_movements`. Transfer/adjustment source reads use pool-level helpers inside a transaction callback rather than the transaction client with a lock.

**Effect:** Central reports cannot reproduce these operations. Absolute quantity updates from unlocked prior reads can overwrite concurrent sales or transfers. Reading the response through a separate connection before commit can also return stale stock.

**Repair:** Route these actions through shared stock commands. Read and lock using the same transaction connection, record signed adjustment deltas and central movements, and fetch committed response data after success.

### P0-6. Automatic receipt is neither staff confirmation nor fully serialized

**Evidence:** `api/services/stockAutomation.js`, `runAutoReceiveDispatched`, selects aged dispatched transfers before the transaction and credits branches without locking/revalidating the transfer itself. It uses requested item quantity rather than a consistently resolved approved/dispatched/received allocation.

**Effect:** Overlapping jobs or staff receipt can duplicate credits. Timeout-based physical receipt also conflicts with the requirement to remain in transit until the receiving branch confirms receipt.

**Repair:** Prefer overdue reminders/escalation, not stock credit. If automatic acceptance is explicitly authorized by the business, it must use the same locked/idempotent receipt command and verified quantities as manual receipt.

### P0-7. Startup historical healing can add already-consumed stock

**Evidence:** `server.js`, startup transfer-gap repair around lines 3779–3910. It selects historical received transfers with apparently missing receipt movements, adds approved/requested quantity to branch batches, and only afterward checks for an existing movement. There is no shared transfer repair lock or persistent repair-operation identity. The inserted physical credit is not paired with BIM history.

**Effect:** Mismatched receipt references can be mistaken for missing stock. Repeated or concurrent startup can add stock again. Approved quantity can exceed actual partial receipt. Historical stock subsequently sold must not be recreated simply because a receipt reference is missing.

**Repair:** Replace automatic additive healing with a read-only discrepancy report. Implement only a reviewed migration with canonical references, actual receipt evidence, repeat-safe repair identities, and approved corrections. Do not restart services as a way to “fix” stock.

### P1-1. Editing or deleting a sale does not reverse its stock effect

**Evidence:** `api/branch/walkin-sales.js`, PUT/PATCH around lines 727–761 directly updates `branch_walkin_sales`; DELETE around lines 764–788 deletes the row. Neither path reverses posted batch allocations, movements, or financial records.

**Effect:** Sales history/revenue can change while stock remains deducted. A deleted sale also weakens refund/audit traceability.

**Repair:** Make posted quantity/branch/product allocations immutable. Provide an authorized cancellation/reversal operation linked to the original sale and original batches. Allow only explicitly harmless metadata edits in ordinary PATCH.

### P1-2. Import posting can leave partial or ledger-only results

**Evidence:** `api/supplier-imports.js` creates document, batch, and movement with independent writes. `api/stock/import/receive.js` posts a movement before inserting its stock batch and processes lines separately.

**Effect:** A later failure can leave partial receipt, orphan accounting, or retry duplication. Random IDs and generic conflict suppression are not shipment/line idempotency.

**Important:** `tests/import-partial-failure.spec.js` explicitly documents existing partial-commit behavior. Changing this requires an intentional contract change, not silently modifying implementation while retaining incompatible expectations.

**Repair:** Choose atomic shipment receipt or explicit individually committed receipt lines. In either model, each line's batch, ledger, document status, and operation identity must commit together, with the UI accurately showing successful and failed lines.

### P1-3. Receipt quantities and ownership are insufficiently constrained

**Evidence:** Barcode receipt validates positivity but does not consistently reject non-finite numbers or enforce locked transfer-line/cumulative entitlement. `receive-request.js` locks only selected request fields and accepts branch/source information from the request body. Its source shortfall is a warning while destination credit proceeds.

**Effect:** Wrong branch/source, unrelated lines, excessive quantities, or mismatched prior deductions can produce fabricated or incorrectly attributed stock.

**Repair:** Resolve branch, source, approved lines, actual dispatch allocations, and prior receipts from locked stored documents. Validate finite positive base-unit quantities and cumulative receipt totals. A legitimately pre-deducted dispatch must be recognized explicitly; do not blindly deduct twice or blindly ignore a shortage.

### P1-4. FEFO deductions and posted batch identity can diverge

**Evidence:** Transfer helpers deduct multiple eligible source rows, while downstream movements may use the requested item's batch/expiry instead of every actual consumed allocation. The request-receipt FEFO query can deduct by product without the declared batch filter.

**Effect:** Total quantity can look correct while batch stock cards, expiry, supplier traceability, and cost are incorrect.

**Repair:** Have deduction helpers return allocation records with source batch ID, product ID, batch, expiry, quantity, and historical cost. Persist and post one correctly attributed allocation per consumed layer.

### P1-5. FEFO ordering is not an expired-stock exclusion

**Evidence:** Branch sale/campaign/dispense queries prioritize expiry but select positive stock without a uniform actual-expiry and sellability condition. Expiry automation proposes write-offs pending approval.

**Effect:** An expired positive batch can remain eligible before approval, even if FEFO ordering works as written.

**Repair:** Apply one sellability predicate to sales, dispensing, dispatch allocation, availability, and barcode stock display. Define missing-expiry and expiry-day policies explicitly. Separate expiry quarantine from financial write-off approval.

### P1-6. Approved adjustments are not atomic

**Evidence:** `server.js`, `/api/stock-adjustments/:id/approve`, reads pending adjustment outside a lock, updates batch stock with standalone queries, attempts a ledger insert inside a catch that logs/skips failure, then independently marks approved.

**Effect:** Duplicate approval or a failed audit write can leave corrected stock without a matching ledger effect. Quantity delta uses recorded `old_value`, which may be stale after intervening stock activity.

**Repair:** Lock adjustment and target stock in one transaction. Decide whether approval applies an explicitly requested delta or a validated counted quantity. Do not swallow required ledger failures. Treat metadata corrections separately and preserve historical identity/valuation implications.

### P1-7. The reconciliation screen cannot yet be relied upon

**Evidence:** `api/admin/stock-reconciliation.js`, warehouse query around lines 107–110 references `sb.description`. The `sb` CTE exposes it as `product_name`, not `description`.

**Effect:** The query fails with an undefined-column error. Also, individual source batch rows are compared with aggregated ledger balances, and warehouse LEFT JOINs omit ledger-only/overlay-only records.

**Repair:** Correct the alias, aggregate both sides at a declared common key, and include missing records from every store. Display discrepancies rather than silently selecting an overlay as indisputable truth.

### P1-8. Balance identity and valuation are too coarse

**Evidence:** `stockEngine.js`, `recomputeInventoryBalanceTx`, keys balances by location type/ID, normalized product name, and batch number. Expiry is metadata, not part of the key. The movement query is not location-restricted; price/expiry metadata is assigned before the loop determines whether that movement belongs to the requested location.

**Effect:** Same batch with different expiries/cost layers can collapse. A price from another location's movement can influence a balance's valuation. Last-seen nonzero price is not a documented weighted/FIFO costing method.

**Repair:** Define stable product/batch/expiry/condition identity and cost-layer policy. Restrict metadata attribution to the actual relevant allocation. Plan a reviewed migration and report transition rather than changing keys without rebuilding historical projections.

### P2. Display fallbacks and reporting need a single accounting contract

`getInventoryByBranch` merges physical batches with central balance fallback by product/batch, not expiry. Zero physical rows guard some ghosts, but deleted exhausted rows remove that evidence. Movement display uses absolute quantities in places, which can obscure signed adjustments.

The walk-in display uses `Math.max` against BIM-derived quantity; it is **not** a simple unconditional sum. MIS also contains existing double-count guards. Preserve these protections while replacing mixed-source heuristics with reconciled accounting, and do not claim every report currently double-counts.

Asynchronous recomputations can leave stale displays after a successful transaction. Some recomputation failures are logged per key rather than propagated as an overall failure. Derived reports need freshness/error visibility and reliable retry.

## 6. Capability assessment against the requested system

| Requirement | Current assessment | Work required |
|---|---|---|
| Suppliers, orders, shipments/import references | Present/partial | Link order lines to repeat-safe actual receipt lines and shortages/damage. |
| Ordered, received, damaged, missing quantities | Partial | Consistent line-level receipt/discrepancy states and approvals. |
| Freight, duties, other import expenses | Cost fields present; full allocation not identified | Expense allocation policy, calculations, audit, rounding, and cost layers. |
| Batch/barcode/expiry receipt | Present | Strict validation and preserved actual allocation identity. |
| Warehouse movements and balances | Present but inconsistent across stores | Atomic commands and reconciled physical/ledger projections. |
| Available/reserved/damaged/expired stock | Partial | Explicit condition/reservation accounting, not loose status inference. |
| Physical stock counts | Complete workflow not identified | Count sessions, cutoff/concurrency policy, recount/approval, delta movements. |
| Warehouse→branch, warehouse→warehouse, branch→branch | Routes exist | Common state machine, transit accounting, source/destination scope, exact allocations. |
| Transit until branch confirmation | Conflicts with timeout auto-receipt | Keep transit open; reminders and explicit confirmed receipt. |
| Receipt shortages/damage | Discrepancy records exist in some paths | Cumulative per-line receipt, condition disposition, approval/report visibility. |
| Sales deduct correct branch stock | Primary transactional deduction exists | Remove unsafe fallbacks, enforce eligibility, and unify all sale paths. |
| Barcode product identification | Present | Resolve product/unit first; use branch-scoped eligible stock and batch where needed. |
| Sale cancellation/refund | Partial and unsafe | Original-allocation reversals, operation locks, quantity caps, condition, financial consistency. |
| Customer returns | Refund-related path exists | Condition acceptance and original-sale links. |
| Branch returns to warehouse | Generic movement support/return lists exist | Complete authorized return lifecycle and destination acceptance. |
| Supplier returns and credits | Complete lifecycle not identified | Supplier-linked return dispatch, stock deduction, credit status, evidence. |
| Damage/expiry/internal use/write-off | Present in generic movement/approval paths | Common stock command, signed audit, reason validation and atomic approval. |
| FEFO | Ordering exists | Exclude unsellable stock and record actual split allocations. |
| Product codes and pack conversions | Codes exist; conversion workflow not identified | Product base units, pack definitions/barcodes, immutable transaction conversion. |
| Current stock/history/valuation | Many report paths exist | Canonical quantities, layer costs, reconciliation and projection freshness. |
| Sales/revenue/returns/gross profit | Data and reports exist | Atomic reversals and original cost of goods, not live price substitution. |
| Low stock/expiry alerts | Present | Correct eligible-stock denominator and configurable policies. |
| Slow-moving products | Complete dedicated workflow not identified | Defined movement window and inactivity criteria. |
| Date/product/supplier/location filters | Present unevenly across handlers | Shared filter definitions, timezone boundaries, supplier provenance per allocation. |

None of these goals is inherently impossible. Correct historical physical quantities and costs may be impossible to reconstruct automatically where receipts, allocations, condition, or original cost evidence were not recorded.

## 7. Implementation plan

### Phase A — Establish a safe baseline

1. Obtain an approved backup/snapshot before implementation or historical corrections.
2. Inventory every stock-mutating endpoint, including inline server handlers and jobs.
3. Disable automatic additive historical repair through an approved change; use read-only discrepancy reporting instead.
4. Replace timeout stock receipt with reminders unless the business explicitly approves automatic acceptance.
5. Fix reconciliation SQL and aggregate at comparable identities; include missing-on-either-side records.
6. Produce a baseline discrepancy report for development and, with authorization, production.
7. Confirm business decisions in section 10 before identity, unit, valuation, or receipt-state migrations.

**Exit condition:** Every mutation entry point is listed; discrepancies are visible without modifying stock; historical repair is not silently adding quantities.

### Phase B — Shared atomic operations, starting with transfers

1. Introduce focused shared stock commands using the existing structure and database, not a wholesale rewrite.
2. Standardize movement semantics, operation references, allocation records, and transition rules.
3. Add reviewed persistent unique constraints for business-operation/line identities. Decide NULL batch/expiry semantics before index changes.
4. Lock documents and batches in a consistent order to avoid concurrent duplicate effects and reduce deadlocks.
5. Move general transfer status/items into the stock transaction.
6. Unify country/warehouse/branch transfers and all receipt entry points, including barcode and request receipt.
7. Preserve reservation ownership and release it exactly once on eligible cancellation/rejection.
8. Record transit and partial receipt explicitly; never infer destination receipt from elapsed time.
9. Reject insufficient unreserved stock and unauthorized/unrelated lines; distinguish prior legitimate dispatch deduction.

**Exit condition:** One operation succeeds once across retries/endpoints; failure rolls back status and all stock effects; company stock is conserved during transit.

### Phase C — Branch stock, sales, reversals, and adjustments

1. Route manual branch receive/transfer/adjustment through the shared commands.
2. Remove cache-derived physical batch creation from campaign sales.
3. Apply common eligible-stock/FEFO allocation to walk-in, campaign, and dispensing paths.
4. Preserve the existing offline-sale unique protection and make retries return the existing result safely.
5. Lock refunds, validate original sale/remaining return entitlement, and restore only accepted saleable allocations.
6. Align central saleable-return classification with physical restoration; quarantine damaged/expired returns.
7. Replace destructive posted-sale edits/deletes with linked cancellation/reversal.
8. Make adjustment approval atomic; record reason, actor, before/after/delta, and original reference.
9. Keep stock and financial effects consistent, using a transactional outbox for work that must occur outside the transaction.

**Exit condition:** Concurrent sales/refunds/adjustments cannot create negative or duplicated stock; cancellation/refund is auditable and capped.

### Phase D — Receiving, product identity, units, conditions, and costs

1. Choose explicit atomic-shipment or per-line import receipt behavior and update its UI/test contract.
2. Persist order, shipment, receipt, allocation, and supplier references together.
3. Add damaged/missing receipt disposition and approval rules.
4. Introduce stable product identity and reviewed batch/expiry/condition keys while supporting existing records.
5. Define base units, pack conversions, pack barcodes, and fractional-quantity policy.
6. Define landed-cost allocation and cost-layer preservation. Store calculation inputs and rounding reconciliation.
7. Complete customer/branch/supplier return workflows with condition, original-reference, refund/credit, and acceptance states.
8. Implement physical count sessions with a cutoff or intervening-movement reconciliation policy; post approved differences, not blind quantity overwrites.

**Exit condition:** Every received/returned unit has a product, base-unit quantity, condition, source reference, and traceable cost where available.

### Phase E — Reporting, controlled repair, and rollout

1. Make reports use one documented accounting contract rather than adding overlapping sale/movement sources.
2. Rebuild balance projections after approved identity/classification changes; do not recreate physical stock from those projections.
3. Preserve old-versus-new comparison reports until reconciliation is accepted.
4. Standardize date filters as timezone-aware inclusive starts/exclusive next-period ends; test final-second/fractional-second boundaries.
5. Standardize supplier/product/location filters with allocation provenance.
6. Calculate cost of goods/refunds using original allocation cost and clearly label DP/catalog value separately from landed cost.
7. Show report freshness, missing-cost warnings, failed refreshes, low/out-of-stock eligibility, expiry, and slow-moving definitions.
8. Roll out to a test warehouse/branch, reconcile physical and ledger quantities, then expand.

**Exit condition:** Physical stock, ledger, cached balances, stock cards, and financial reports reconcile for the same declared scope and date.

## 8. Tests and acceptance criteria

Existing tests to extend:

- `tests/branch-receipt-inventory-balance.spec.js`
- `tests/refund-batch-restore.spec.js`
- `tests/refund-ghost-cleanup.spec.js`
- `tests/transfer-b2b-receipt-increases-dest-balance.spec.js`
- `tests/transfer-cancel-voids-movements.spec.js`
- `tests/import-partial-failure.spec.js`
- `tests/stock-portal-handlers.spec.js`

Do not interpret their existence as proof that concurrent or cross-endpoint cases pass.

| Test scenario | Required result |
|---|---|
| Failure after status/item/physical-stock write but before final movement | Whole business operation rolls back; no success response or notification. |
| Same receipt submitted simultaneously through barcode and transfer API | One physical credit and one canonical receipt event. |
| Manual receipt concurrent with background job | No duplicate credit; background work cannot bypass state checks. |
| Two refunds approved concurrently | One approval; original sale entitlement and financial reversal remain correct. |
| Campaign sale after deleting an exhausted batch while cache is stale | No physical recreation; insufficient-stock result where appropriate. |
| Sale concurrent with manual transfer/write-off/adjustment | No lost update, oversell, or unauthorized stock creation. |
| Warehouse and branch transfers through approval/dispatch/receipt | Reservation/transit/available quantities reconcile without double source deduction. |
| Cancel approved versus dispatched transfer | Reserved stock is released once only where cancellation is allowed; dispatched stock needs controlled reversal. |
| Partial/damaged/missing receipt and subsequent receipt attempt | Behavior follows the agreed cumulative/finalization policy with quantities fully accounted for. |
| NaN/infinite/negative/zero quantities, unknown line, wrong source/destination | Validation rejects the operation before stock changes. |
| FEFO spans multiple batches/expiries/cost layers | Posted allocations match actual deductions exactly. |
| Expired, quarantined, reserved, and missing-expiry batches | Only policy-eligible quantities can be sold/dispatched. |
| Sale edit/delete/cancellation/refund | No silent history removal; linked stock and financial effects reconcile. |
| Refund when original physical batch is deleted | Restore only original eligible allocation/condition with proper identity; no guessed cost/expiry. |
| NULL batch/expiry and competing creation | No duplicate logical batch; defined handling preserves real distinct lots. |
| Import retry and later-line failure | Matches documented atomic/per-line contract without orphan ledger/batch entries. |
| Physical count concurrent with sales | Approved difference accounts for movements after cutoff; no overwrite of intervening activity. |
| Carton receipt and unit sale | Base-unit quantity and cost conversion reconcile with defined rounding. |
| Freight/duty allocation and return credit | Total allocations match invoice expenses and original costs. |
| Reconciliation query, split imports, and ledger-only stock | Endpoint works; common-key aggregation detects genuine drift without false mismatches. |
| Date boundaries, supplier/location filters, branch aliases | Same period/scope produces consistent stock and financial totals. |
| Offline sale retry and changed stock availability | Duplicate retry is repeat-safe; a new offline sale cannot bypass shortage validation. |
| Role/location scope and approval actor | Unauthorized branch/source/destination/approval rejected; actor derived from authenticated user. |
| Projection refresh failure | Transaction remains durable; stale/failed projection is visible and retryable, never used to manufacture stock. |
| Restart/overlapping startup processes after historical repair | No additional physical credit or duplicated repair movement. |

Include invariant checks after each scenario: physical and ledger quantities by allocation key; nonnegative eligible stock; local opening/movement/closing formula; company-wide conservation for internal transfers; document state aligned with movements; and exactly-once operation effects.

## 9. Historical repair procedure

1. Produce a read-only discrepancy inventory for physical batches, branch movements, central ledger, transfer/receipt records, sales/refunds, and cost layers.
2. Normalize aliases and references for comparison without changing evidence.
3. Identify whether each difference is missing history, duplicate history, stale cache, wrong batch/expiry, wrong location, or genuinely wrong physical quantity.
4. Compare against actual receipt evidence and physical counts. A transfer approval or missing reference alone does not prove stock should be added.
5. Preview proposed corrections with quantity/value impact and supporting evidence.
6. Obtain authorized approval. Preserve original records and add explicit linked correction/reversal records.
7. Execute repeat-safe repairs in transactions, recording a persistent repair identity.
8. Rebuild derived projections and compare totals before/after.
9. Retain unresolved discrepancies for investigation rather than setting them to zero or hiding negative balances.

Where evidence is insufficient, use a supervised physical count and an approved opening/correction baseline. Do not invent historical allocations, receipt conditions, supplier costs, or gross profit.

## 10. Business decisions required

1. Are partial receipts final, or can further deliveries be received against the same transfer?
2. When is source stock reserved versus dispatched, and who owns stock in transit?
3. Who approves shortages/damage and where is damaged stock held?
4. Should any transfer ever be auto-received without staff confirmation?
5. Is an expiry-date batch saleable on that date? How are missing-expiry lots handled?
6. Which products permit fractional base units, and what are approved pack conversion factors?
7. When can a customer return become saleable, and who accepts its condition?
8. Which costing method governs inventory and gross profit, and how are freight/duties allocated?
9. Which metadata can be corrected on posted transactions, and which changes require reversal?
10. What count cutoff and approval process governs physical stocktake corrections?

These choices should be resolved before major schema or accounting changes. They do not prevent fixing the confirmed atomicity, duplicate-operation, cache-recreation, and SQL defects first.

## 11. Recommended first implementation scope

Start with reconciliation visibility and the atomic transfer/receipt command, then fix refund approval and campaign cache resurrection. These address the clearest stock-creation/double-deduction risks while establishing a reusable foundation for manual branch operations and the remaining lifecycle.

Keep implementation incremental, preserve the existing database and application structure, and obtain approval before major architecture/schema changes or historical stock corrections. Do not modify protected `assets/` content or `dynapharm-complete-system.html`.

This report is a repair specification, not evidence that repairs have already been applied. The application and stock data remain unchanged by this review.
