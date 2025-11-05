## Stock Management Workflows

This document defines the end-to-end workflows for the Stock Management Portal components. It aligns with `stock-management-portal.html` and the local APIs under `api/`.

### 1) Stock Requests
- **Initiate Request**: Branch creates request with items and notes → status `pending`.
- **Branch Manager Approval**: Approves/rejects. If rejected → terminal. If approved → next stage.
- **Warehouse Manager Approval**: For `sales_replenishment` requests → approve/reject.
- **GM Approval (when required)**: For `internal` or `urgent` priority → approve/reject.
- **Status Progression**:
  - pending → pending_warehouse/pending_gm (as required) → approved → fulfilled
- **Fulfillment**:
  - Create transfer from selected warehouse (driver/vehicle/notes) → link `transferId` on request → mark request `fulfilled`.

References: `createStockRequest`, `approveStockRequest`, `fulfillStockRequest` in `api/stock-requests.js`.

### 2) Stock Transfers
- **Create**: Auto-created from approved request with items and destination branch.
- **Dispatch**: Set `dispatchedAt`, `dispatchedBy`; update warehouse stock `out` and/or `reserve` as policy requires.
- **In Transit**: Status `pending` until delivery.
- **Deliver**: Set `deliveredAt` upon arrival.
- **Receive**: Set `receivedAt`, `receivedBy`; update destination stock `in`.
- **Reconciliation**: Ensure `warehouseStock` history is recorded for each movement.

References: `getStockTransfers`, `updateWarehouseStock` in `api/stock-requests.js`.

### 3) Warehouse Stock Management
- **Stock In**: On receiving or import, call `updateWarehouseStock(warehouseId, productId, qty, 'in')`.
- **Stock Out**: On dispatch/sale, call `updateWarehouseStock(warehouseId, productId, qty, 'out')`.
- **Reserve/Unreserve**: For allocations, use `reserve` and `unreserve` to track soft commitments.
- **Thresholds & Alerts**:
  - Low stock: `quantity <= reorderLevel` → warn
  - Overstock: `quantity > reorderLevel * 10` → warn
- **Snapshot**: Displayed in portal under Warehouse Stock Snapshot.

References: `getWarehouseStock`, `updateWarehouseStock`, `getStockStatistics` in `api/stock-requests.js`.

### 4) Barcode/Batch Stock (FEFO)
- **Import Batch**: `importStockWithBarcode({ cartonNo, description, batchNo, expiryDate, quantity, totalCtns })` → creates barcode and batch.
- **FEFO Picking**: Use `getFEFOStock(description)` to sort batches by earliest expiry.
- **Dispatch to Branch**: `dispatchStockByBarcode(barcode, qty, toBranch)` → records dispatch, reduces `remainingQuantity`, moves toward `exhausted` if 0.
- **POS Sale by Scan**: `scanBarcodeForSale(barcode)` → validate expiry/qty → `sellStockByBarcode` to record sale and decrement.
- **Statistics**: `getBarcodeStockStatistics()` → total value, expiring batches, low stock products.

References: `web-modules/barcode-stock.js` exports.

### 5) Products & Pricing
- **Create/Update Product**: `saveProduct` with validation and automatic price history tracking.
- **Price List Upload**: `uploadPriceList` → preview; `applyPriceListUpload` → apply adds/updates and record upload.
- **Audit Trail**: `getPriceHistory(productId)` for historical pricing.

References: `api/products.js`.

### 6) Dashboard Tabs/Views in Portal
- **Filters**: Branch, Warehouse, Product, Date Range, Search → drive `refreshData()`.
- **KPIs**: Pending transfers, low stock items, total stock value, alerts.
- **Real-time Movements**: Aggregated from requests, transfers, barcode dispatches (localStorage-driven).
- **Daily by Branch**: Summarized `in/out` and invoice surrogates.
- **Alerts**: Suspicious large outs, low/over stock, rendered with timestamps.
- **Exports/Print**: CSV export and printable dashboard snapshot.

References: `stock-management-portal.html` module script.

### 7) Roles & Approvals Summary
- **Branch Manager**: First-line approval for all requests.
- **Warehouse Manager**: Approval for `sales_replenishment` requests; manages dispatches and stock movements.
- **GM**: Approves `internal` and `urgent` requests.

### 8) Data Stores (Local)
- Requests: `localStorage['dyna_stock_requests']`
- Transfers: `localStorage['dyna_stock_transfers']`
- Warehouse Stock: `localStorage['dyna_warehouse_stock']`
- Barcode Stock: `localStorage['dyna_barcode_stock']` and `['dyna_barcode_inventory']`
- Products: `localStorage['dyna_products']` and related pricing keys

### 9) Operational Notes
- Ensure requests reach `approved` before calling `fulfillStockRequest`.
- Always update `warehouseStock` on dispatch/receive to keep snapshot accurate.
- FEFO must be enforced for expirable products; avoid dispatching expired stock.
- Use search/product filter in the dashboard to narrow movement lists before export/print.


