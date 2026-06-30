---
name: receive-request warehouse deduction
description: Why receive-request.js must deduct from stock_batches and use branch_receipt movement type
---

## Rule
`api/stock/receive-request.js` must:
1. FEFO-deduct from `stock_batches` at `warehouseSource` within the transaction (same query pattern as `fefoDeductStockBatches` in transfers.js).
2. Use `movement_type = 'branch_receipt'` (not `'received'`) — `branch_receipt` is in BOTH `INWARD_TYPES` and `OUTWARD_TYPES` in stockEngine.js, so warehouse `inventory_balances` is decremented on recompute.
3. Call `recomputeLocationBalances('warehouse', warehouseSource)` after transaction (in addition to the branch recompute).
4. `warehouseSource` comes from `selectedRequest.dispatch_warehouse` in BranchPortal — `stock_requests.dispatch_warehouse` column holds the dispatching warehouse ID.

**Why:** `'received'` is only in `INWARD_TYPES`, not `OUTWARD_TYPES`. Using it means the warehouse `inventory_balances` is never decremented and `stock_batches.remaining_quantity` is never reduced — warehouse stock appears unchanged after a branch receives it.

**How to apply:** Any future changes to the stock-request receipt path must maintain these three properties. The FEFO deduction is best-effort (logs a warn on shortfall but does not abort the receipt) to handle cases where stock was pre-deducted via a linked transfer.
