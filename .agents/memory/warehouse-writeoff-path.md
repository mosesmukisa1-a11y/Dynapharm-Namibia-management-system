---
name: Warehouse write-off deduction path
description: How write-offs sourced from a warehouse location are processed vs branch write-offs.
---

When a `write_off` stock_movement has `source_location_type = 'warehouse'` (detected via `inferLocationType(source_location)`), the GM approval handler in `api/stock-movements.js` takes a separate path:

- Deducts from `stock_batches.remaining_quantity` (FIFO, specific batch first, then expiry order), not `branch_inventory_batches`
- Updates `inventory_balances` directly in-transaction (closing_qty - qty, outward_qty + qty)
- Logs a `'write_off'` entry in `warehouse_inventory_movements`
- Sets `disposal_status = 'dispose_off'` (no return-to-warehouse since it IS the warehouse)
- Returns `{ branchId: null, effectiveBranchId: null, warehouseId: branchId }` so `recomputeLocationBalances('warehouse', warehouseId)` is called

**Why:** Warehouses use `stock_batches` (not `branch_inventory_batches`). Without this branch, warehouse write-off approvals would silently skip stock deduction.

**How to apply:** Any new movement type that sources from a warehouse must similarly check `inferLocationType` and route accordingly.
