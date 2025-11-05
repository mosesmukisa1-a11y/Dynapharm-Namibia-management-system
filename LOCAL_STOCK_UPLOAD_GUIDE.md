# Local Stock Upload to Country Stock - Complete Guide

## Overview
The system automatically uploads local stock to country stock inventory when you use the bulk import feature in the Stock Management Portal.

## How It Works

### 1. Access the Stock Import Feature
- Navigate to **Stock & Inventory Management Portal**
- Go to the **Country Stock** tab
- Use the **"Import Stock (Table Format)"** form

### 2. Import Process
When you submit stock data through the bulk import form:
1. **Barcode Generation**: Each item gets a unique barcode (format: `BC[timestamp][random]`)
2. **Batch Tracking**: Stock is recorded with:
   - Carton Number
   - Product Description
   - Batch Number
   - Expiry Date (YYYY-MM format)
   - Quantity
   - Total Cartons
   - Location: Automatically set to `'country_stock'`
   - Status: Set to `'available'`

### 3. Data Storage
Stock is stored in localStorage:
- **Key**: `dyna_barcode_stock`
- **Location**: `country_stock` (automatically set)
- **Format**: Array of batch objects

### 4. Display in Country Stock
The system displays barcode stock in the Country Stock inventory view by:
- Filtering batches with `location === 'country_stock'`
- Filtering for `status === 'available'`
- Combining with regular country stock entries
- Showing remaining quantities

### 5. Integration with Warehouse Transfers
When transferring stock from Country Stock to warehouses (Windhoek/Ondangwa):
- System checks both regular `countryStock` and barcode stock
- Uses FEFO (First Expired First Out) logic
- Deducts from barcode batches automatically

## Import Fields Required

| Field | Type | Required | Example |
|-------|------|----------|---------|
| Cartons No. | Text | Yes | A1-98 |
| Description | Text | Yes | Product description |
| Batch No. | Text | Yes | DP24265 |
| Expiry Date | Month | Yes | 2025-12 |
| Quantity | Number | Yes | 100 |
| Total (CTNS) | Number | Yes | 50 |

## CSV Import
You can also import from CSV using the "Import from CSV" button.

## Batch Structure in localStorage

```javascript
{
  id: 'BATCH[timestamp]',
  barcode: 'BC[timestamp][random]',
  cartonNo: 'A1-98',
  description: 'Product Name',
  batchNo: 'DP24265',
  expiryDate: '2025-12',
  expiryTimestamp: timestamp,
  quantity: 100,
  totalCtns: 50,
  importDate: 'ISO date string',
  location: 'country_stock',  // Automatically set
  status: 'available',
  dispatchedQuantity: 0,
  remainingQuantity: 100
}
```

## FEFO (First Expired First Out) Logic
- Stock is automatically sorted by expiry date
- Older expiring stock is dispatched first
- Prevents stock wastage

## Verification Steps

1. **Check Import Success**: Look for success message after import
2. **View in Country Stock**: Click "Refresh" in Country Stock tab
3. **Verify Barcode**: Each batch will have a unique barcode
4. **Check Quantities**: Remaining quantities should match imported amounts

## Troubleshooting

### Stock Not Showing
- Click the "Refresh" button
- Check browser console for errors
- Verify location is set to `'country_stock'`

### Import Failed
- Ensure all fields are filled
- Check for duplicate entries
- Verify date format (YYYY-MM)

### Missing Batches
- Check `dyna_barcode_stock` in localStorage
- Filter for `location === 'country_stock'`
- Verify `status === 'available'`

## Code References

### Import Handler
- **Location**: `dynapharm-complete-system.html` (line ~17875)
- **Function**: `bulkStockImportForm` submit handler
- **API**: `importStockWithBarcode()` from `web-modules/barcode-stock.js`

### Display Function
- **Location**: `dynapharm-complete-system.html` (line ~17296)
- **Function**: `displayCountryStock()`
- **Filter**: `b.location === 'country_stock' && b.status === 'available'`

### Barcode Stock Module
- **File**: `web-modules/barcode-stock.js`
- **Key Function**: `importStockWithBarcode(stockData)`
- **Storage**: localStorage `dyna_barcode_stock`

## Summary
✅ All stock imported through the bulk import form is **automatically uploaded to country stock**
✅ The system uses barcode tracking and FEFO logic
✅ No manual upload needed - it's part of the normal import process
✅ Stock is immediately available for warehouse transfers and distributions

