# Dynapharm Namibia Health Management System

## Overview
This project is a cloud-based health management system for Dynapharm International Namibia, designed to centralize and optimize operations across sales, inventory, HR, finance, and CRM. Its primary purpose is to enhance efficiency, data accuracy, and provide real-time business insights. The system features a multi-portal architecture, an e-commerce shop, advanced pricing and profit analysis, and comprehensive reporting. The ambition is to digitize Dynapharm's business, improve engagement with customers and distributors, and support data-driven decision-making for market expansion and increased profitability in Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is a React-based Single Page Application (SPA) built with Vite, utilizing a modular structure, context-based authentication for role-based access to 11 portals, and an API client for backend communication. Styling is implemented using Tailwind CSS v4, adhering to Dynapharm's corporate theme.

### Backend
The backend is an Express.js server providing API services. It features file-based routing, JWT-based authentication with cookie-based sessions, and a PostgreSQL connection pool. API routes are secured with middleware, with specific routes designated as public.

### Core Features
- **Multi-Portal System**: 12 distinct portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) providing dedicated functionalities and UI/UX.
- **Role-Based Access Control**: Granular access control is implemented based on user roles.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with server-side validation.
- **Pricing Engine**: Manages comprehensive pricing, including Distributor Price (DP), Consumer Price (CP), Business Volume (BV), and Cost Insurance Freight (CIF), with fuzzy product lookup and profit calculation.
- **AI Stock Management System**: An AI-powered inventory intelligence system (Stock Portal) with features like a Global Branch Selector, AI Command Center for real-time insights, and AI Reorder Tab using velocity-based demand forecasting. The `stockAI Engine` uses pure JavaScript for its AI functionalities. It includes supplier imports with batch/expiry tracking, country and branch stock views, field stock management, and various reports (formula, expiry, valuation, movement log).
- **Branch Stock Summary**: A comprehensive endpoint (`api/branch/stock-summary.js`) provides real-time per-branch stock data by aggregating information from multiple inventory tables, with deduplication logic and period filtering.
- **Branch ID Matching**: Flexible matching of branch names to database branch IDs across the Stock Portal.
- **Distributor and Staff Management**: Functionality for registration, bulk import, agreement management, and staff administration with approval workflows.
- **Reporting and Analytics**: Dashboards and reports across portals offer insights into sales, profits, branch performance, and KPIs.
- **UI/UX Design**: Consistent Dynapharm branding with specific color schemes, gradient headers, clear navigation, and modal-based workflows.
- **Consultant Portal**: Manages client interactions, checkups, reports, follow-ups, and analytics, incorporating consultation fees and referral crediting.
- **Stock Management Workflow**: A structured workflow from supplier import to branch receipt, including GM approval for transfers. Transfer statuses and an audit trail ensure full traceability.
- **Dispatch Note Document**: A detailed operational document (`client/src/components/DispatchNote.jsx`) with 7 sections for comprehensive stock movement tracking, including item details, approvals, and receipt acknowledgements, with barcode and print/PDF support.
- **Server-side Stock Adjustments**: The backend automatically adjusts inventory levels upon changes in transfer status, utilizing FEFO (First Expiry First Out) for stock deductions and preventing negative quantities.
- **Modal/Dialog Close Pattern**: Stock workflow modals remain open on API errors with inline messages, and action buttons display loading states and are disabled during processing.
- **Stock Movement Routing**: Stock movements are routed to appropriate database tables (`stock_movements`, `branch_inventory_movements`, `warehouse_inventory_movements`) based on type and location, with server-side filtering. All movement INSERT statements include `batch_no` and `expiry_date` for full traceability.
- **Write-Off Stock Deduction**: Write-offs recorded via the stock-movements endpoint automatically deduct from `branch_inventory_batches` using FEFO (First Expiry First Out).
- **Sales Double-Count Prevention**: The `stock-summary.js` endpoint prevents double-counting by: (a) excluding `customer` and `patient` from branch location matching, (b) skipping `branch_walkin_sales` item qty aggregation when `stock_movements` already provides sale data for a branch.
- **Branch Inventory Math (Single Source of Truth)**: `getInventoryByBranch` in `api/branch/inventory.js` uses ONLY `branch_inventory_movements` (BIM) for enrichment — NOT `stock_movements`. Merging both caused all values to be doubled since each sale/receipt writes to both tables. AggMap keyed by `product_name` only (BIM lacks `batch_no`). For multi-batch products, quantities are distributed proportionally by batch size.
- **Stock Formula Report**: `printStockFormulaReport` in BranchPortal uses enriched inventory fields (`qty_received`, `qty_sold`, `qty_dispensed`, `qty_written_off`) as single source of truth. Formula: Opening = Closing + Sold + Dispensed + WriteOffs + Transferred − Received.
- **Walk-in Sale Data Flow**: Transactional FEFO multi-batch stock deduction for walk-in sales, using row locking and recording movements across relevant tables.
- **Prescription Dispensing Workflow**: A full dispensing pipeline in the BranchPortal with draft, preview, and transactional dispense functionalities, including stock sufficiency validation.
- **Receive Stock Validation**: Mandatory batch number and expiry date validation for stock receipt forms.
- **Branch Portal Stock Module**: An enhanced stock engine within the Branch Portal with 7 sub-tabs: Inventory, Alerts (batch-intelligent, expiry countdown), Requests, Transfers (full traceability), Movements (structured ledger with type labels), Write-Off, and Reports (including DP Sales, Physical Stock, Stock Formula, Movements, Receiving Stock). Internal reporting uses DP price exclusively.
- **Enriched Inventory API**: The `api/branch/inventory.js` endpoint provides enriched inventory data by combining information from multiple tables to compute per-batch aggregates and movement details.
- **Backend CamelCase-to-SnakeCase Mapping**: The backend handles conversion of camelCase fields to snake_case database columns for PATCH operations.

### Database
A PostgreSQL database with 40 fully migrated tables, pre-seeded with key data and a super admin user.

### Authentication
Authentication is optional, allowing all portals to be accessible without login. JWT tokens stored in httpOnly cookies provide user identity when logged in. Staff and distributor registrations require admin approval.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Tailwind CSS v4**: CSS framework.
- **XLSX.js**: For bulk distributor import.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.