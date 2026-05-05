# Dynapharm Namibia Health Management System

## Overview
The Dynapharm Namibia Health Management System is a cloud-based solution designed to centralize and optimize Dynapharm International Namibia's operations across sales, inventory, HR, finance, and customer relationship management. It aims to enhance efficiency, ensure data accuracy, and provide real-time business insights through a multi-portal architecture, an integrated e-commerce shop, advanced pricing and profit analysis capabilities, and comprehensive reporting. The system's core purpose is to digitize Dynapharm's business processes, improve engagement with customers and distributors, and facilitate data-driven decision-making to support market expansion and increase profitability within Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is a React-based Single Page Application (SPA) built with Vite. It features a modular structure, context-based authentication for role-based access across 11 distinct portals, and a dedicated API client for backend communication. Styling is implemented using Tailwind CSS v4, adhering to Dynapharm's corporate theme.

### Backend
The backend operates on an Express.js server, providing robust API services. It employs file-based routing and secures communications using JWT-based authentication with httpOnly cookie-based sessions. A PostgreSQL connection pool manages database interactions, and API routes are protected by middleware. The backend also handles automatic camelCase to snake_case conversion.

### File Storage
File uploads (videos, photos, documents) are stored in Replit's App Storage (Google Cloud Storage bucket) via the `@replit/object-storage` package for persistence across deployments. Uploads are handled via `multer` in memory, then transferred to object storage, and their URLs are stored in the database.

### Offline-First Branch Transactions
Branches can transact without internet connectivity. The system automatically syncs via a native IndexedDB queue when connection is restored. A React context manages online/offline status and triggers batch synchronization to the `/api/sync/batch` endpoint upon reconnection. A service worker ensures network-first fetching without caching.

### Core Features
- **Multi-Portal System**: 12 specialized portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) with tailored functionalities and UI/UX.
- **Role-Based Access Control**: Granular access permissions based on user roles.
- **E-commerce Shop**: Supports member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing with server-side validation.
- **Pricing Engine**: Manages comprehensive pricing structures (DP, CP, BV, CIF) with fuzzy product lookup and profit calculation.
- **AI Stock Management System**: AI-powered inventory intelligence within the Stock Portal, featuring a Global Branch Selector, AI Command Center, AI Reorder Tab using velocity-based demand forecasting, and batch/expiry tracking.
- **Write-Offs Multi-Item Form**: Supports writing off multiple products with shared reasons and dynamic item lists, including redistribution to target locations.
- **Centralized Stock Engine**: `api/services/stockEngine.js` uses `stock_movements` as the single source of truth and `inventory_balances` as a derived cache.
- **Stock Movement Workflow**: Structured process from supplier import to branch receipt, including GM approval for transfers and FEFO logic for deductions.
- **Country Stock → Warehouse Dispatch Flow**: A 3-stage approval chain for stock transfers from country stock to warehouses, including GM approval and warehouse acceptance/rejection.
- **Dispatch Note Document**: Detailed operational document with barcode support and print/PDF functionality.
- **Distributor QR Card**: Branded, downloadable, and shareable QR cards for distributors.
- **Referral Landing Page**: Public page for distributors to promote their network.
- **Distributor and Staff Management**: Features for registration, bulk import, agreement management, and staff administration with approval workflows.
- **Reporting and Analytics**: Dashboards and reports for sales, profits, branch performance, and KPIs.
- **Consultant Portal**: Manages client interactions, check-ups, reports, and consultation fees. Consultants can now edit the prescription (diagnosis, medicines, follow-up) of completed consultations directly from the Checkups (completed tab) and Reports sections via the "✏️ Edit Prescription" / "✏️ Edit Rx" buttons, which opens `PrescriptionEditModal`.
- **Admin Appointment Editor**: Admins have a new "📅 Appointments" tab in AdminPortal that lists all appointments with search/filter. Each appointment has an "Edit" button opening a tabbed full-edit modal covering: Personal & Referral, Appointment Details, Health Profile, Lifestyle, and Prescription (if a report exists). Saves update both the `appointments` row and the linked `reports` row atomically.
- **Director Portal**: Executive intelligence through 10 API endpoints and a rewritten frontend with 7 tabs for comprehensive analysis using `recharts`.
- **Branch Activity Capture System**: Centralizes transaction capture via `branch_activity_transactions` for all branch-facing workflows.
- **Transactional Stock Deduction**: Walk-in sales use transactional FEFO multi-batch stock deduction with row locking.
- **Prescription Dispensing Workflow**: Complete dispensing pipeline in the Branch Portal, including draft creation, preview, and transactional dispense.
- **Admin Branch Selector**: Allows admin users to perform actions on behalf of any branch.
- **HR Portal Backend**: Integrated APIs for managing leave requests, warnings, terminations, attendance, and performance reviews.
- **Campaigns System**: Supports various campaign types with CRUD API, participant management, and auto-winner generation.
- **Finance Portal**: Enhanced with real API routes across all tabs, including Deposit Inbox, Expense review, Bonus workflow, and Reports.
- **Rent / Lease Payments**: Managed via `branch_rent_payments` with Finance proposing edits and GM approval.
- **Salary Ledger**: `salary_ledger` table with approval workflows for edits/removals through `salary_edit_requests`.
- **Database Startup Migration**: Normalizes branch ID aliases and auto-seeds `inventory_balances` on server boot.
- **Distributor Network Marketing System**: Implements an MLM network tree with sponsor codes, computing PSBV/PGBV/GBV via DFS traversal.
- **Distributor Profit Ledger**: Tracks distributor profits from non-member walk-in sales, with payout flows and ledger visibility in portals.
- **Credit Refund Workflow**: Branch staff submit refund requests, Stock Manager approves/rejects, triggering inventory movements and financial adjustments in reports.
- **Campaign Sales Reporting (Fixed)**: Daily and monthly branch sales reports now correctly handle campaign sales. Member campaign sales were previously double-counted (appearing in both member_sale BAT rows and campaign_sale inventory movement synthetic rows). Fix: `campaignRefIds` set filters out campaign sale references from `txRows` and `walkinSynthetic` before merging — `campaignSynthetic` is the sole authoritative source. Also added per-product campaign detail (`campaignProductMap`, `buildCampaignWithDetail`) returning `line_items` in the `campaign_sales` API response. The DP Sales Report print function now includes a "5. Campaign Sales (DP)" category row highlighted in amber, product-level line items table per campaign sale, and a "🎁 Campaign Sales (DP)" line in the DP Sales Summary. The `refund_deductions` display in the summary now correctly reads `data.refund_deductions?.total_amount`.

### Build Workflow
The Express backend (`server.js`) serves the pre-built React SPA from the `dist/` directory on port 3001. The Vite dev server (port 5000) is separate. After any code changes, `npx vite build` must be run to update the `dist/` bundle for the backend to serve the latest version.

### Database
A PostgreSQL database with 42 fully migrated tables, pre-seeded with essential data and a super admin user. Key tables include `finance_remittances`, `hr_records`, and `hr_leave_requests`.

### Authentication
JWT tokens stored in httpOnly cookies provide user identity. Sessions are restored via `/api/auth/me`. Staff and distributor accounts require admin approval. A dedicated modal `DistributorLoginModal` handles unauthenticated access to the distributor portal.

## External Dependencies
- **PostgreSQL**: Primary relational database.
- **Tailwind CSS v4**: Utility-first CSS framework.
- **XLSX.js**: Library for handling Excel files.
- **Vite**: Modern frontend build tool.
- **Node.js/Express.js**: Backend runtime environment and web application framework.