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
The frontend is a React-based Single Page Application (SPA) built with Vite, utilizing a modular structure, context-based authentication for role-based access to 11 portals, and an API client for backend communication. Styling is implemented using Tailwind CSS v4, adhering to Dynapharm's corporate theme with specific color schemes and gradient headers.

### Backend
The backend is an Express.js server providing API services. It features file-based routing, JWT-based authentication with cookie-based sessions, and a PostgreSQL connection pool. API routes are secured with middleware, with specific routes designated as public. The backend also handles camelCase to snake_case conversion for database interactions.

### Core Features
- **Multi-Portal System**: 12 distinct portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) providing dedicated functionalities and UI/UX.
- **Role-Based Access Control**: Granular access control based on user roles.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with server-side validation.
- **Pricing Engine**: Manages comprehensive pricing (DP, CP, BV, CIF) with fuzzy product lookup and profit calculation.
- **AI Stock Management System**: An AI-powered inventory intelligence system (Stock Portal) with a Global Branch Selector, AI Command Center, and AI Reorder Tab using velocity-based demand forecasting. It includes supplier imports with batch/expiry tracking, country/branch stock views, field stock management, and various reports. The `stockAI Engine` uses pure JavaScript. The Stock Portal has 30+ fully built API routes under `/api/stock/*` covering: overview, ai-command, ai-reorder, barcode, country-stock, country-stock/items, monthly-sales (+ branches + products), valuation (+ locations + products), inventory, orders, distribution (+ requests + pending), field-stock, edit-requests, realtime, warehouses/windhoek/* (summary, inventory, incoming, outbound, movements), warehouses/ondangwa/* (summary, inventory, incoming, outbound, movements), and reports/* (summary, branch-stock, movements, expiry, low-stock, company). All routes verified with live data from DB.
- **Centralized Stock Engine (`api/services/stockEngine.js`)**: Universal write+read service where `stock_movements` is the single source of truth and `inventory_balances` is a derived fast-read cache. Features functions like `postStockMovement()`, `recomputeInventoryBalance()`, `recomputeLocationBalances()`, `seedInventoryBalances()`, `getAvailableStock()`.
- **Stock Movement Workflow**: Structured workflow from supplier import to branch receipt, with GM approval for transfers and full traceability via transfer statuses and audit trails.
- **FEFO (First Expiry First Out) Logic**: Applied for stock deductions during write-offs, sales, and dispensing.
- **Dispatch Note Document**: Detailed operational document with 7 sections for stock movement tracking, including item details, approvals, and receipt acknowledgements, with barcode and print/PDF support.
- **Distributor and Staff Management**: Registration, bulk import, agreement management, and staff administration with approval workflows.
- **Reporting and Analytics**: Dashboards and reports across portals for sales, profits, branch performance, and KPIs.
- **Consultant Portal**: Manages client interactions, checkups, reports, follow-ups, consultation fees, and referral crediting.
- **Director Portal**: Features 10 API endpoints for executive intelligence (`/api/director/*`) and a rewritten frontend with 7 tabs for comprehensive analysis, utilizing `recharts` for visualizations.
- **GM/Finance/MIS Shared Engine**: `api/services/gmFinanceMisEngine.js` provides shared services for these three portals, reading exclusively from `inventory_balances` and `branch_walkin_sales`.
- **Branch Activity Capture System**: Centralized transaction capture engine with `branch_activity_transactions` table as the single source of truth for all branch-facing workflows. `POST /api/branch-activity/capture` is the master endpoint that accepts any branch client interaction (consultation, full_body_checkup, walkin_sale, member_sale, non_member_sale, online_order, prescription_dispensing) and classifies it. `GET /api/reports/branch-sales/daily` aggregates directly from this table — daily report shows 0 only when there was truly no activity, not due to missing joins. `POST /api/branch-client-visits/checkin` tracks physical client attendance even without purchases. `POST /api/jobs/rebuild-daily-branch-report` backfills and repairs existing data from `branch_walkin_sales` and `stock_movements`. Both `walkin-sales.js` and `dispense.js` auto-post into `branch_activity_transactions` after each transaction. Validation enforces business rules (nb_number required for member_sale, etc.). Supports dry_run mode for the rebuild job.
- **Live System Correction APIs**: 19 endpoints for system information, sample data management, distributor lookups (`/api/distributors/search?q=`, `/api/distributors/by-nb/:nb`), sales reports (branch/company level), stock import/dispatch/receipt, non-member sales, consultation details, and prescription dispensing.
- **Frontend API Client (`client/src/lib/api.js`)**: Fully wired with namespaces for all portals: `api.gm.*`, `api.finance.*`, `api.director.*`, `api.system.*`, `api.sales.*`, `api.consultations.*`, `api.prescriptions.*`, `api.receipts.*`, and fixed `api.distributors.search()` to call `/distributors/search?q=`.
- **GM Portal Live Summary**: Dashboard calls `/api/gm/summary` and renders a "Company Live Summary" card showing cross-branch sales, stock value (DP), stock unit counts (warehouse/branch/transit), and alert counts.
- **Finance Portal Live Summary**: Dashboard calls `/api/finance/summary` and renders a "Backend Finance Summary" card showing revenue breakdown and stock valuation by location.
- **Director Portal**: Fully data-connected via `useDirectorApi` hook calling `/api/director/*` endpoints (summary, profit-loss, revenue-trends, branches/performance, fast-moving products, registrations).
- **Transactional Stock Deduction**: Walk-in sales utilize transactional FEFO multi-batch stock deduction with row locking and movement recording.
- **Prescription Dispensing Workflow**: Full dispensing pipeline in the BranchPortal with draft, preview, and transactional dispense functionalities, including stock sufficiency validation.
- **Branch Portal Stock Module**: Enhanced stock engine with 7 sub-tabs: Inventory, Alerts (batch/expiry), Requests, Transfers, Movements, Write-Off, and Reports. Receive Stock flow shows the full GM-approved dispatch note read-only; receiver just confirms receipt with zero manual input — only marks discrepancies if needed (toggle button per item). Receiver is auto-signed from login.
- **Branch ID Matching**: Optimized single-query resolution using `ANY($1)` array match instead of sequential queries. Flexible matching of branch names to database branch IDs across the Stock Portal and Branch Portal using a `BRANCH_CANONICAL` map.
- **FEFO Stock Deduction**: Exact product name matching prioritized over fuzzy ILIKE to prevent cross-product deduction errors.
- **Batch Upsert**: `ON CONFLICT DO UPDATE` for branch inventory batch insertion prevents duplicate key errors when receiving stock with existing batch records.
- **Stale State Prevention**: Data loading effects use ref-based generation counters to discard stale responses when branch selection changes rapidly.
- **Database Startup Migration**: Normalizes branch ID aliases and auto-seeds `inventory_balances` if empty on server boot.

### Database
A PostgreSQL database with 42 fully migrated tables, pre-seeded with key data and a super admin user. New tables added: `finance_remittances` (remittance payments to suppliers) and `hr_records` (HR operational records for warnings, terminations, attendance, performance) and `hr_leave_requests` (employee leave requests with approval workflow).

### Finance Portal Backend
- **Remittance Tab**: Fully wired to `api/finance/remittances.js` and `finance_remittances` DB table. Records and lists supplier remittance payments with amount, reference, date, and status.
- **Finance API**: `api.finance.remittances()` and `api.finance.createRemittance()` added to client `api.js`.

### HR Portal Backend
- **All tabs wired to live backend**: Leave, Warnings, Terminations, Attendance, Performance all use real API calls.
- **Leave API** (`api/hr/leaves.js`): GET/POST/PUT `/api/hr/leaves` — supports listing, submitting, and approving leave requests.
- **Records API** (`api/hr/records.js`): GET/POST `/api/hr/records?type=...` — supports warnings (subtype: Verbal/Written/Final), terminations, attendance (subtype: Present/Late/Absent/On Leave), performance reviews.
- **HR API client**: `api.hr.leaves()`, `api.hr.submitLeave()`, `api.hr.updateLeave()`, `api.hr.records()`, `api.hr.createRecord()` added to client `api.js`.

### GM Portal Fixes
- **Leave approval** calls `PUT /api/hr/leaves?id={id}` (fixed from `/employees/leaves/{id}`)
- **Transfer approvals** query `GET /api/stock/transfers?status=pending_approval`

### Country Stock → Warehouse Dispatch
- Transfers now use `status: 'pending_approval'` so they appear in GM approval queue
- Transfer `from_warehouse='country_stock'`, `to_branch=warehouse_key` (e.g. 'windhoek_warehouse')

### Authentication
Authentication is optional, allowing all portals to be accessible without login. JWT tokens stored in httpOnly cookies provide user identity. Staff and distributor registrations require admin approval.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Tailwind CSS v4**: CSS framework.
- **XLSX.js**: For bulk distributor import.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.