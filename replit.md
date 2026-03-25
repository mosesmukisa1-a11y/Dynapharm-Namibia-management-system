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
- **AI Stock Management System**: An AI-powered inventory intelligence system (Stock Portal) with a Global Branch Selector, AI Command Center, and AI Reorder Tab using velocity-based demand forecasting. It includes supplier imports with batch/expiry tracking, country/branch stock views, field stock management, and various reports. The `stockAI Engine` uses pure JavaScript.
- **Centralized Stock Engine (`api/services/stockEngine.js`)**: Universal write+read service where `stock_movements` is the single source of truth and `inventory_balances` is a derived fast-read cache. Features functions like `postStockMovement()`, `recomputeInventoryBalance()`, `recomputeLocationBalances()`, `seedInventoryBalances()`, `getAvailableStock()`.
- **Stock Movement Workflow**: Structured workflow from supplier import to branch receipt, with GM approval for transfers and full traceability via transfer statuses and audit trails.
- **FEFO (First Expiry First Out) Logic**: Applied for stock deductions during write-offs, sales, and dispensing.
- **Dispatch Note Document**: Detailed operational document with 7 sections for stock movement tracking, including item details, approvals, and receipt acknowledgements, with barcode and print/PDF support.
- **Distributor and Staff Management**: Registration, bulk import, agreement management, and staff administration with approval workflows.
- **Reporting and Analytics**: Dashboards and reports across portals for sales, profits, branch performance, and KPIs.
- **Consultant Portal**: Manages client interactions, checkups, reports, follow-ups, consultation fees, and referral crediting.
- **Director Portal**: Features 10 API endpoints for executive intelligence (`/api/director/*`) and a rewritten frontend with 7 tabs for comprehensive analysis, utilizing `recharts` for visualizations.
- **GM/Finance/MIS Shared Engine**: `api/services/gmFinanceMisEngine.js` provides shared services for these three portals, reading exclusively from `inventory_balances` and `branch_walkin_sales`.
- **Live System Correction APIs**: 19 endpoints for system information, sample data management, distributor lookups (`/api/distributors/search?q=`, `/api/distributors/by-nb/:nb`), sales reports (branch/company level), stock import/dispatch/receipt, non-member sales, consultation details, and prescription dispensing.
- **Frontend API Client (`client/src/lib/api.js`)**: Fully wired with namespaces for all portals: `api.gm.*`, `api.finance.*`, `api.director.*`, `api.system.*`, `api.sales.*`, `api.consultations.*`, `api.prescriptions.*`, `api.receipts.*`, and fixed `api.distributors.search()` to call `/distributors/search?q=`.
- **GM Portal Live Summary**: Dashboard calls `/api/gm/summary` and renders a "Company Live Summary" card showing cross-branch sales, stock value (DP), stock unit counts (warehouse/branch/transit), and alert counts.
- **Finance Portal Live Summary**: Dashboard calls `/api/finance/summary` and renders a "Backend Finance Summary" card showing revenue breakdown and stock valuation by location.
- **Director Portal**: Fully data-connected via `useDirectorApi` hook calling `/api/director/*` endpoints (summary, profit-loss, revenue-trends, branches/performance, fast-moving products, registrations).
- **Transactional Stock Deduction**: Walk-in sales utilize transactional FEFO multi-batch stock deduction with row locking and movement recording.
- **Prescription Dispensing Workflow**: Full dispensing pipeline in the BranchPortal with draft, preview, and transactional dispense functionalities, including stock sufficiency validation.
- **Branch Portal Stock Module**: Enhanced stock engine with 7 sub-tabs: Inventory, Alerts (batch/expiry), Requests, Transfers, Movements, Write-Off, and Reports.
- **Branch ID Matching**: Flexible matching of branch names to database branch IDs across the Stock Portal and Branch Portal using a `BRANCH_CANONICAL` map.
- **Database Startup Migration**: Normalizes branch ID aliases and auto-seeds `inventory_balances` if empty on server boot.

### Database
A PostgreSQL database with 40 fully migrated tables, pre-seeded with key data and a super admin user.

### Authentication
Authentication is optional, allowing all portals to be accessible without login. JWT tokens stored in httpOnly cookies provide user identity. Staff and distributor registrations require admin approval.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Tailwind CSS v4**: CSS framework.
- **XLSX.js**: For bulk distributor import.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.