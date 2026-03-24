# Dynapharm Namibia Health Management System

## Overview
This project is a cloud-based health management system for Dynapharm International Namibia, aiming to streamline operations across sales, inventory, HR, finance, and CRM. It provides a comprehensive platform for managing products, distributors, branches, orders, and staff, enhancing efficiency, data accuracy, and business insights. Key capabilities include a multi-portal architecture, a robust e-commerce shop, detailed pricing and profit analysis, and extensive reporting features. The system seeks to digitize Dynapharm's operations, improve customer and distributor engagement, and provide real-time data for informed decision-making, leading to market expansion and increased profitability in Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is a React-based Single Page Application (SPA) built with Vite. It features a modular structure, context-based authentication (`AuthContext.jsx`) for role-based access to 11 distinct portals, and an API client (`api.js`) for backend communication. Styling is managed with Tailwind CSS v4, incorporating Dynapharm's corporate theme colors.

### Backend
The backend is an Express.js server providing API services and serving the React frontend in production. It uses file-based routing for API endpoints, JWT-based authentication with cookie-based sessions (`auth.js`), and a PostgreSQL connection pool with query helpers (`db.js`). All API routes utilize middleware for authentication, with specific public routes for non-authenticated access.

### Core Features
- **Multi-Portal System**: 12 distinct portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) with dedicated functionalities and UI/UX.
- **Role-Based Access Control**: Granular access control based on user roles.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with server-side validation.
- **Pricing Engine**: Comprehensive `PRICE_LIST` and `PACKAGE_DATABASE` for products and packages, including Distributor Price (DP), Consumer Price (CP), Business Volume (BV), and Cost Insurance Freight (CIF). Features fuzzy product lookup, profit calculation, and cart total calculation.
- **AI Stock Management System**: An AI-powered inventory intelligence system (`/stock` — StockPortal.jsx) with 20+ tabs, including a Global Branch Selector, AI Command Center with real-time AI Insights, and an AI Reorder Tab using velocity-based demand forecasting. The `stockAI Engine` uses pure JS for its AI functionalities. Full stock module includes: Supplier Import (GRN/CIF/DPC/batch/expiry tracking via `api/supplier-imports.js`), Country Stock & Warehouse views (batch/expiry/CIF/DPC per item), Branch Stock dashboard (per-branch formula: Opening + Issued - Sales - Returns - Expiring = Closing, with CIF/DPC values), Field Stock (`api/field-stock.js` with issue/return/sold workflow per officer), comprehensive Reports (formula report, expiry/shelf-life report, stock valuation CIF vs DPC with margins, movement log), Distribution with batch visibility, and enhanced Dispatch Notes with full traceability.
- **Distributor Management**: Functionality for distributor registration, bulk import, and agreement form management, including a shared `DistributorPerformanceTab` component.
- **Staff and User Management**: Tools for employee management, staff registration with admin approval, and user administration.
- **Reporting and Analytics**: Various dashboards and reports across portals providing insights into sales, profits, branch performance, and KPIs.
- **UI/UX Design**: Consistent Dynapharm branding with specific color schemes and gradient headers for different portals, clear navigation, and modal-based workflows.
- **Consultant Portal**: Provides comprehensive client management, checkup forms, reports, follow-ups, analytics, and staff services, matching a reference system (`dynapharm-complete-system.html`). Includes features for consultation fees, where non-members pay N$200 and members N$150, with a portion credited to the referral distributor and consultant.
- **Stock Management Workflow**: Supplier Import → Country Stock → Distribution to Warehouses → Warehouse Dispatch to Branch (GM approval) → Branch Receipt. Transfer statuses: `submitted`, `received`, `pending_approval`, `approved`, `rejected`, `delivered`, `returned`, `partially_received`. GM actions: Approve, Reject, Amend & Approve, Return for Correction. Branch receipt includes item-level receipt, e-signature, and discrepancy notes. Audit trail tracks all amendments.
- **Dispatch Note Document** (`client/src/components/DispatchNote.jsx`): Full operational stock document with 7 sections: A) Header (company, title, reference number, barcode, date, status, prepared by), B) Source/Destination (warehouse details, branch name/code/address/phone/region), C) Item Table (10 columns: #, Product Name, Product Code, Batch No, Expiry Date, Unit, Qty Prepared, Qty Approved, Qty Received, Remarks), D) Warehouse Notes, E) GM Approval Section (status, name, date, comment, amendment details with original vs approved values), F) Branch Receipt Section (received by, date, e-signature, receipt status, discrepancy flag), G) Audit Footer (created/approved/received timestamps and actors). Includes Code128 barcode SVG, print/PDF support. Used in GMPortal and BranchPortal.
- **DB columns for transfers**: `stock_transfer_items` (expiry_date, quantity_approved, quantity_received, discrepancy_note); `stock_transfers` (gm_action, gm_comment, amended_by_gm, amended_at, signature_name, branch_receipt_note, discrepancy_flag, receipt_status)
- **Server-side Stock Adjustments** (`api/stock/transfers.js` PATCH handler): Backend automatically adjusts actual inventory levels when transfer status changes:
  - **`received`** (Country→Warehouse): Deducts from `stock_batches` at country_stock, upserts `warehouse_inventory`, logs `transfer_in` movement
  - **`approved`** (GM approval): Deducts from warehouse `stock_batches` and `warehouse_inventory` (reserves stock), logs `reserved` movement. Prevents double-deduction if dispatched after approval.
  - **`dispatched`** (Warehouse→Branch): Only deducts warehouse stock if not already done during approval; logs `transfer_out` movement
  - **`delivered`/`partially_received`** (Branch receipt): Creates/updates `branch_inventory_batches`, logs `branch_inventory_movements` and `stock_movements` with `transfer_in` type
  - Uses FEFO (First Expiry First Out) ordering for stock deductions
  - All deductions use `GREATEST(0, ...)` to prevent negative quantities
  - Previous status is captured before update to prevent duplicate adjustments
- **Modal/Dialog Close Pattern**: All stock workflow modals close only after successful API calls (not before). On API errors, modals stay open with inline error messages (not behind-modal alerts) so users can retry. Action buttons (Approve, Reject, Submit, Confirm Receipt) show loading text ("Processing...", "Submitting...", "Approving...") and are disabled during API calls. Cancel buttons are also disabled during processing. Data refresh uses `setTimeout(() => loadData(), 100)` to avoid React state batching race conditions with modal close. After successful receipt, sub-tab switches to 'inventory' for immediate stock view.
- **Stock Movement Routing** (`api/stock-movements.js`): Movement types `write_off`, `sale`, `return`, `field_use`, and `received` are stored in the `stock_movements` table. Other movement types (warehouse-specific) go to `warehouse_inventory_movements` (requires `warehouse_id`). Transfer receipt movements are created by the backend atomically (not duplicated by frontend). Supports server-side branch filtering via `?branch=X` param (LIKE on source/destination locations), plus `?type=`, `?date_from=`, `?date_to=` filters.
- **Branch Portal Stock Module** (BranchPortal.jsx — Stock tab): Fully enhanced data-driven stock engine with 6 sub-tabs:
  - **Inventory**: Batch-level table with filters (search, batch, status), columns (product, batch, expiry, days-left, balance, status badge, DP unit, DP total), totals footer (total qty, total DP value)
  - **Alerts**: 5-type KPI grid (low stock, near expiry, expired, out of stock, pending receipts) + detailed alert table with product/batch/expiry/qty/action
  - **Movements**: Full stock ledger combining `branch_inventory_movements` + `stock_movements` (server-filtered by branch), composite-key deduplication, filters (search, type, date range), totals bar (inward/outward/net/DP out), 11-column table with type badges
  - **Write-Off**: Inventory-linked modal with product dropdown (from inventory), batch/qty/expiry info, reason dropdown (expired/damaged/lost/spoiled/adjustment-approved), DP value preview
  - **Reports**: 6 report cards with DP-based print: Daily/Monthly DP Sales (5 categories: walk-in, member, non-member, online, prescription), Physical Stock (DP valued), Stock Formula, Stock Movements (DP valued), Receiving Stock
  - All internal reporting uses DP price only via `findProductPrice()` from `client/src/lib/pricing.js`
- **Backend CamelCase-to-SnakeCase Mapping** (`api/stock/transfers.js`): The PATCH handler converts camelCase fields to snake_case DB columns. Uses `!== undefined` checks (not truthy checks) to correctly handle `null` values for `signatureName`, `branchReceiptNote`, `receiptStatus`.

### Database
A PostgreSQL database with 40 fully migrated tables, including products, branches, users, and distributors (12,500+ records). Key data is pre-seeded, and a super admin user is auto-seeded.

### Authentication
Authentication is optional; all portals are accessible without login. JWT tokens stored in httpOnly cookies provide user identity when logged in. The system functions gracefully without authentication, with API routes being public by default. Both staff and distributor registrations require admin approval.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Tailwind CSS v4**: CSS framework.
- **XLSX.js**: For bulk distributor import.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.