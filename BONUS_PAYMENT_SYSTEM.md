# Bonus Payment System - Complete Documentation

## Overview

The bonus payment system is now fully separated from the reports API and provides comprehensive monthly bonus tracking with payment reconciliation. **The monthly CSV upload is the source of truth** - distributors not appearing in the CSV for a particular month cannot be paid.

## System Components

### 1. **Monthly Bonus CSV Upload** (`finance-bonus-upload.html`)
- **Purpose**: Upload monthly bonus CSV files per month
- **Key Features**:
  - Month selection (YYYY-MM format)
  - CSV parsing with support for commas, semicolons, and quoted fields
  - Amount normalization for various formats (2 708,03, 1,602, etc.)
  - Branch filtering (NB1, NB2, NB3, NB4)
  - Preview before upload
  - Template CSV download
- **Required CSV Columns**:
  - `DRN` - Dealer Registration Number
  - `NAME` - Distributor name
  - `STOCKIST` - Stockist code
  - `AREA` - Branch area
  - `NAD` - Amount in Namibian Dollars
  - `SIGNATURE` - Optional payment signature
- **Storage**: Saves to `/api/bonus` with month-specific storage
- **Validation**: Ensures only distributors in the CSV can be paid

### 2. **Bonus Payment Recording** (`bonus-payment-record.html`)
- **Purpose**: Record individual bonus payments (cash or bank)
- **Payment Methods**:
  - **💰 Cash Payments** - For branch payments
    - Requires branch selection (NB1-NB4)
  - **🏦 Bank Payments** - For finance payments
    - No branch required
- **Features**:
  - Month and distributor search
  - Automatic validation against monthly CSV
  - Prevents payment if distributor not in CSV
  - Shows if payment already exists
  - Records payment method, amount, paid by, and notes
- **Validation Rule**: ✅ **Distributor MUST exist in monthly CSV to process payment**

### 3. **Bonus Payment Statement** (`bonus-payment-statement.html`)
- **Purpose**: Monthly payment reconciliation and overview
- **Features**:
  - Month selection for statement view
  - Statistics dashboard:
    - Total records
    - Paid vs Unpaid counts and amounts
    - Cash vs Bank payment breakdown
    - Total amount summary
  - Detailed table showing:
    - All distributors in monthly CSV
    - Payment status (paid/unpaid)
    - Payment method (cash/bank)
    - Who paid and when
  - CSV export functionality
- **Use Case**: Finance reconciliation at month-end

### 4. **Individual Bonus History** (`bonus-payment-history.html`)
- **Purpose**: View complete bonus history per distributor across all months
- **Features**:
  - Search by DRN or distributor name
  - Distributor information card
  - Summary statistics:
    - Total records
    - Total amount
    - Paid amount
    - Unpaid amount
  - Monthly breakdown table with payment details
  - CSV export for individual history
- **Use Case**: Distributor inquiries and historical tracking

### 5. **Bonus API** (`api/bonus.js`)
- **Dedicated endpoint**: `/api/bonus`
- **Data Storage**: `bonus_data.json` (separate from reports)
- **Endpoints**:
  - `GET /api/bonus?action=uploads` - List all monthly uploads
  - `GET /api/bonus?action=month&month=YYYY-MM` - Get specific month upload
  - `GET /api/bonus?action=statement&month=YYYY-MM` - Get monthly statement
  - `GET /api/bonus?action=history&drn=XXX` - Get distributor history
  - `GET /api/bonus?action=payments&month=YYYY-MM` - Get payments for month
  - `POST /api/bonus` with `action=upload` - Upload monthly CSV data
  - `POST /api/bonus` with `action=payment` - Record payment
  - `PUT /api/bonus` with `action=update-payment` - Update payment
  - `DELETE /api/bonus?action=upload&month=YYYY-MM` - Delete monthly upload

## Payment Workflow

### Monthly Upload (Finance)
1. Finance uploads bonus CSV via `finance-bonus-upload.html`
2. Select month (defaults to current month)
3. Upload CSV file
4. Review and verify totals
5. Commit to system
6. **This becomes the source of truth for that month**

### Cash Payment (Branches)
1. Branch staff opens `bonus-payment-record.html`
2. Selects month and searches for distributor (DRN or name)
3. System validates distributor exists in monthly CSV
4. If valid, selects "Cash Payment"
5. Selects branch (NB1-NB4)
6. Enters amount (pre-filled from CSV), paid by name, optional notes
7. Records payment
8. **System prevents payment if distributor not in CSV**

### Bank Payment (Finance)
1. Finance opens `bonus-payment-record.html`
2. Selects month and searches for distributor
3. System validates distributor exists in monthly CSV
4. If valid, selects "Bank Payment"
5. Enters amount, paid by name, optional notes
6. Records payment
7. **System prevents payment if distributor not in CSV**

### Reconciliation (Finance)
1. Finance opens `bonus-payment-statement.html`
2. Selects month to view
3. Reviews:
   - Total uploaded vs paid
   - Cash vs bank breakdown
   - Individual payment status
4. Exports CSV for records

## Data Structure

### Monthly Upload
```json
{
  "month": "2024-03",
  "createdAt": "2024-03-15T10:00:00Z",
  "uploadedBy": "finance",
  "items": [
    {
      "drn": "DZ011269",
      "name": "NALUMINO MOYOWANYAMBE",
      "stockist": "NBA",
      "area": "NB1",
      "amount": 2708.03,
      "signature": "PAID"
    }
  ],
  "totalRecords": 150,
  "totalAmount": 450000.00
}
```

### Payment Record
```json
{
  "drn": "DZ011269",
  "name": "NALUMINO MOYOWANYAMBE",
  "month": "2024-03",
  "method": "cash",
  "amount": 2708.03,
  "status": "paid",
  "paidAt": "2024-03-20T14:30:00Z",
  "paidBy": "Branch Manager NB1",
  "branch": "NB1",
  "notes": "Payment confirmed"
}
```

## Key Rules & Validations

1. **Source of Truth**: Monthly CSV upload is the ONLY source of bonus eligibility
2. **Payment Validation**: Distributors NOT in CSV cannot be paid - system will reject
3. **Monthly Separation**: Each month has its own upload and payment tracking
4. **Payment Methods**:
   - Cash payments require branch selection
   - Bank payments handled by finance (no branch)
5. **Duplicate Prevention**: System shows if payment already exists for distributor/month

## Files Created

1. `api/bonus.js` - Dedicated bonus API endpoint
2. `finance-bonus-upload.html` - Updated with month selection and new API
3. `bonus-payment-record.html` - Payment recording interface
4. `bonus-payment-statement.html` - Monthly reconciliation view
5. `bonus-payment-history.html` - Individual distributor history

## API Base URL Detection

The system auto-detects the API base URL:
- Railway.app: `${protocol}//${hostname}/api`
- Vercel.app: `/api`
- Local development: `http://localhost:8001/api`

## Testing Checklist

- [ ] Upload monthly CSV with valid format
- [ ] Verify month selection works
- [ ] Attempt to pay distributor NOT in CSV (should fail)
- [ ] Record cash payment from branch
- [ ] Record bank payment from finance
- [ ] View monthly statement
- [ ] View individual distributor history
- [ ] Export CSV statements
- [ ] Verify duplicate payment prevention

## Important Notes

⚠️ **Critical**: The monthly CSV upload is the **SOURCE OF TRUTH**. Distributors must appear in the CSV for the selected month before any payment can be processed.

💡 **Tip**: Upload the monthly CSV at the start of each month before processing any payments.

📊 **Reconciliation**: Use the payment statement view at month-end to verify all payments are recorded correctly.

