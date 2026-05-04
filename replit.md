# Dynapharm Namibia Health Management System

## Overview
The Dynapharm Namibia Health Management System is a cloud-based solution designed to centralize and optimize Dynapharm International Namibia's operations across sales, inventory, HR, finance, and customer relationship management. The system aims to enhance efficiency, ensure data accuracy, and provide real-time business insights through a multi-portal architecture, an integrated e-commerce shop, advanced pricing and profit analysis capabilities, and comprehensive reporting. Its core purpose is to digitize Dynapharm's business processes, improve engagement with both customers and distributors, and facilitate data-driven decision-making to support market expansion and increase profitability within Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is a React-based Single Page Application (SPA) built with Vite. It features a modular structure, context-based authentication for role-based access across 11 distinct portals, and a dedicated API client for backend communication. Styling is implemented using Tailwind CSS v4, adhering to Dynapharm's corporate theme, including specific color schemes and gradient headers.

### Backend
The backend operates on an Express.js server, providing robust API services. It employs file-based routing and secures communications using JWT-based authentication with httpOnly cookie-based sessions. A PostgreSQL connection pool manages database interactions, and API routes are protected by middleware, with designated public routes. The backend also handles automatic camelCase to snake_case conversion for seamless database operations.

### File Storage
- **Persistent Cloud Storage**: File uploads (videos, photos, documents) are stored in Replit's App Storage (Google Cloud Storage bucket) via the `@replit/object-storage` package, not on the local filesystem. This means uploaded files survive deployments and container restarts.
- **Upload flow**: `api/upload.js` uses multer's memory storage, uploads the buffer to object storage under `public/uploads/`, and stores the URL as `/api/obj/public/uploads/filename` in the database.
- **Serving**: `server.js` includes a `/api/obj/*` route that streams files from object storage. Old pre-migration records with `/uploads/...` URLs are served via `express.static` for backward compatibility.
- **Env vars**: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` are set by Replit App Storage.

### Offline-First Branch Transactions
Branches can transact without internet connectivity. The system automatically syncs when connection is restored.

- **`client/src/lib/offlineQueue.js`** — Native IndexedDB queue (`dynapharm_offline_v1` database, `queue` store). Exports: `enqueue`, `getPendingOnly`, `getAll`, `remove`, `markFailed`, `getCount`, `getFailedCount`, `clearFailed`, `clearAll`, `generateOfflineId`. `getCount()` counts only `pending` items (not failed). `getPendingOnly()` returns items sorted by creation time, excluding failed items.
- **`client/src/lib/OfflineProvider.jsx`** — React context (`useOffline` hook). Detects online/offline via `navigator.onLine` + window events. On reconnect, sends all pending operations to `/api/sync/batch` in a single request. Handles 401 auth errors (sets `authRequired` flag). Exposes: `isOnline`, `isSyncing`, `pendingCount`, `failedCount`, `syncNow`, `clearFailed`, `lastSyncResult`, `authRequired`.
- **`client/src/components/OfflineBanner.jsx`** — Fixed top banner with 5 states: offline (red), pending sync (amber with Sync Now button), failed items only (red with Dismiss button), auth required (orange), success (green). Shows `failedCount` separately from `pendingCount`.
- **`client/public/sw.js`** — Service worker (v3) — all caches cleared on activate; all fetch requests pass through directly to the network (no caching). Clears any previously cached assets from older versions.
- **`api/sync/batch.js`** — POST `/api/sync/batch` — batch replay of queued operations. Deduplicates via `offline_id`.
- **DB columns** — `offline_id VARCHAR(128)` added to `branch_walkin_sales` and `branch_expenses` with partial unique index (`WHERE offline_id IS NOT NULL`) for safe deduplication.
- **Offline-aware submissions** — Walk-in sales and expense recordings in `BranchPortal.jsx` check `navigator.onLine`. If offline: enqueue to IndexedDB + show success to user. If online: submit to API normally (with `offline_id` included for idempotency).

### Core Features
- **Multi-Portal System**: Comprises 12 specialized portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) each offering tailored functionalities and UI/UX.
- **Role-Based Access Control**: Ensures granular access permissions based on user roles.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with server-side validation.
- **Pricing Engine**: Manages comprehensive pricing structures (DP, CP, BV, CIF) with fuzzy product lookup and profit calculation.
- **AI Stock Management System**: An AI-powered inventory intelligence system within the Stock Portal, featuring a Global Branch Selector, AI Command Center, and AI Reorder Tab utilizing velocity-based demand forecasting. It handles supplier imports with batch/expiry tracking, country/branch stock views, field stock management, and various reports. The `stockAI Engine` is implemented in pure JavaScript.
- **Write-Offs Multi-Item Form**: The Write-Offs tab in `StockPortal.jsx` supports writing off multiple products in a single submission. Form has shared Reason/Notes at the top and a dynamic item list with "+ Add Product" / "×" row controls. A running CIF total is shown. A new "Redistribution" reason category (`REASON_CONFIG`) flags stock returned to Country Stock/Warehouse — shows a "Target Location" picker, stores destination in movement notes, and displays "Pending receipt at [target]" in the disposal queue. Branch batches are fetched from `/api/stock/branch/:branchId/inventory` for branch-specific users in addition to central `stock_batches`.
- **Centralized Stock Engine**: `api/services/stockEngine.js` acts as a universal write+read service where `stock_movements` is the single source of truth and `inventory_balances` functions as a derived fast-read cache. It includes functionalities for posting stock movements, recomputing inventory balances, and seeding initial balances.
- **Stock Movement Workflow**: A structured process from supplier import to branch receipt, including GM approval for transfers and full traceability via transfer statuses and audit trails. FEFO (First Expiry First Out) logic is applied for stock deductions.
- **Country Stock → Warehouse Dispatch Flow**: Mirrors the branch dispatch workflow with a 3-stage approval chain. (1) Stock Controller submits dispatch via `POST /api/stock/country-stock/release` → creates `stock_transfers` with `status='pending_approval'` and items in `stock_transfer_items`, **no stock movement yet**. (2) GM approves via existing transfers PUT endpoint → `status='approved'`. (3) Warehouse accepts via `POST /api/stock/warehouses/receive-stock` (action='accept') → FIFO deducts `country_stock` stock_batches, creates warehouse `stock_batches`, records `stock_movements`, marks transfer `received`. Warehouse can also reject (action='reject') → `status='rejected'`, stock stays at country_stock. Warehouse "Incoming" tab has 4 sections: Awaiting GM Approval (read-only), GM Approved (Accept+Reject buttons), Receipt History, Rejected.
- **Dispatch Note Document**: A detailed operational document with 7 sections for stock movement tracking, including item details, approvals, and receipt acknowledgements, with barcode and print/PDF support.
- **Distributor QR Card**: Each distributor can generate a branded canvas QR card (Dynapharm colors, profile photo, rank, NB code) downloadable as PNG and shareable via Web Share API. QR encodes `/ref/:nbCode` referral URL.
- **Referral Landing Page** (`/ref/:nbCode`): Public page showing the distributor's profile card with CTAs to Shop, Book Check-up, or Join as Distributor. Saves referral NB code to localStorage so it auto-fills on Shop and HealthCheckup pages.
- **Distributor and Staff Management**: Features for registration, bulk import, agreement management, and staff administration with approval workflows.
- **Reporting and Analytics**: Provides dashboards and reports across portals for sales, profits, branch performance, and key performance indicators.
- **Consultant Portal**: Manages client interactions, check-ups, reports, follow-ups, consultation fees, and referral crediting.
- **Director Portal**: Offers executive intelligence through 10 API endpoints and a rewritten frontend with 7 tabs for comprehensive analysis, utilizing `recharts` for data visualizations.
- **Branch Activity Capture System**: Centralizes transaction capture via the `branch_activity_transactions` table, serving as the single source of truth for all branch-facing workflows. A master endpoint `POST /api/branch-activity/capture` categorizes various client interactions.
- **Transactional Stock Deduction**: Walk-in sales use transactional FEFO multi-batch stock deduction with row locking and movement recording.
- **Prescription Dispensing Workflow**: A complete dispensing pipeline in the Branch Portal, encompassing draft creation, preview, and transactional dispense functionalities, including stock sufficiency validation.
- **Admin Branch Selector**: Admin users (role='admin') in the Branch Portal can select an "Acting Branch" to perform actions on behalf of any branch without impersonation.
- **HR Portal Backend**: Fully integrated with backend APIs for managing leave requests, warnings, terminations, attendance, and performance reviews.
- **Campaigns System**: Supports various campaign types (discount, buy_x_get_y, bv_achievement, elite_bingo, custom) with full CRUD API, participant management, and auto-winner generation.
- **Finance Portal**: Enhanced with real API routes across all tabs, including a Deposit Inbox for managing branch deposits, Expense review, Bonus workflow, Reports, Notices, and Staff Services.
- **Rent / Lease Payments**: `branch_rent_payments` table with 16 pre-seeded branches; Finance proposes edits → GM approves via "🏘️ Rent Edits" sub-tab in Approvals.
- **Salary Ledger (True Source)**: `salary_ledger` table seeded with 32 employees from March 2026 CSV (N$204,603.73 total salary). Shared `SalaryLedgerTab` component with `role` prop shown in HR Portal (💼 Salary Ledger), Finance Portal (💼 Salary Ledger), and Director Portal (💼 Salary Ledger, read-only). All edits/removals require GM approval via `salary_edit_requests` table; GM reviews via "💼 Salary Edits" sub-tab in Approvals. Backend at `api/hr/salary-ledger.js`.
- **Database Startup Migration**: Normalizes branch ID aliases and auto-seeds `inventory_balances` if empty on server boot.
- **Distributor Network Marketing System**: Implements a full MLM network tree with `sponsor_code` on the `distributors` table (12,404+ distributors). API `api/distributor-network.js` computes PSBV/PGBV/GBV via in-memory memoized DFS tree traversal. The "📊 GM Report View" button in Distributor Performance tab (Branch, Director, GM, MIS portals) renders the GM monthly activity report format (DRN, NAME, DIRECT UPLINE, ORG SPONSOR, CURRENT RANK, ADJUSTED RANK, ACTIVE RANK, AM, RECRUIT, PSBV, PGBV, GBV) with month selector and print. Distributors see only their personal downline via the "🌐 My Network" tab in Distributor Portal. Component: `client/src/components/NetworkReportTab.jsx`.
- **Distributor Profit Ledger**: `branch_distributor_profit` table; `api/branch/distributor-profit.js` for GET (grouped/individual), PATCH (pay single), POST /pay-all (bulk pay by distributor NB). Branch Portal "💰 Distributor Profit" tab with KPI cards, per-distributor payout flow, and pay modal. Auto-records profit on each non-member walk-in sale via `walkin-sales.js`. Distributor Portal "📈 BV & Profit" tab shows retail profit ledger with pending/paid status.

### Database
A PostgreSQL database comprising 42 fully migrated tables. It is pre-seeded with essential data and a super admin user. Key tables include `finance_remittances` for supplier payments, `hr_records` for HR operational data (warnings, terminations, attendance, performance), and `hr_leave_requests` for employee leave management.

### Authentication
JWT tokens stored in httpOnly cookies provide user identity. Sessions are restored on page refresh via `/api/auth/me`. Staff and distributor accounts require admin approval. The distributor portal (`/distributor`) automatically opens the `DistributorLoginModal` when visited unauthenticated — this is triggered by `Layout.jsx` detecting `!user && pathname === '/distributor'`. The modal auto-opens once per visit; closing it resets after navigation. Staff portals use the standard `LoginModal` ("Staff Access") via `ProtectedRoute`.

## External Dependencies
- **PostgreSQL**: Primary relational database.
- **Tailwind CSS v4**: Utility-first CSS framework for styling.
- **XLSX.js**: Library used for handling Excel files, particularly for bulk distributor imports.
- **Vite**: Modern frontend build tool.
- **Node.js/Express.js**: Backend runtime environment and web application framework.