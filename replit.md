# Dynapharm Namibia Health Management System

## Overview
Cloud-based health management system for Dynapharm International Namibia. React + Vite frontend with Node.js/Express backend and PostgreSQL database.

## Architecture

### Frontend (React + Vite)
- **client/** — React SPA source code
- **client/src/App.jsx** — Main routing (all 11 portals + public pages)
- **client/src/components/** — Shared UI components (ui.jsx, Layout.jsx, LoginModal.jsx, ProtectedRoute.jsx)
- **client/src/contexts/AuthContext.jsx** — Auth state, role-based portal access (ROLE_PORTAL_ACCESS)
- **client/src/lib/api.js** — API client for all backend endpoints
- **client/src/lib/constants.js** — Portal definitions, branches, currency formatting
- **client/src/pages/** — Page components (Landing, Shop, HealthCheckup)
- **client/src/pages/portals/** — All 11 portal components
- **client/src/index.css** — Tailwind CSS v4 with Dynapharm theme colors
- **vite.config.js** — Vite config at project root (root: ./client, outDir: ../dist)
- **dist/** — Production build output (served by Express in production)

### Backend (Express)
- **server.js** — Express server, serves API + React build in production
- **api/** — API route handlers (file-based routing, each .js file = one endpoint)
- **api/_lib/auth.js** — JWT authentication library (cookie-based sessions)
- **api/db.js** — PostgreSQL connection pool and query helpers

### Development
- **Backend API workflow**: `PORT=3001 node server.js` (port 3001)
- **Start application workflow**: `npx vite` (port 5000, proxies /api to port 3001)
- Vite dev server provides hot module reload for React components

### Production / Deployment
- Build: `npx vite build` (outputs to dist/)
- Run: `node server.js` (port 5000, serves dist/ + API)
- Deployment target: Autoscale

## Theme Colors
- Primary: #c41e3a (Dynapharm red)
- Primary Dark: #8b0000
- Secondary: #2c3e50
- Accent Blue: #3498db
- Accent Green: #27ae60

## Key API Routes
- `/api/auth/login` — POST, user login
- `/api/auth/logout` — POST, clear session
- `/api/auth/me` — GET, current user profile
- `/api/auth/register` — POST, staff registration (pending approval)
- `/api/products` — CRUD for products (GET is public)
- `/api/branches` — CRUD for branches (GET is public)
- `/api/orders` — Order management
- `/api/distributors` — Distributor management (GET is public)
- `/api/notifications` — Notification system
- `/api/stock-batches` — Stock batch management
- `/api/stock-movements` — Warehouse inventory movements
- `/api/stock/transfers` — Stock transfer management
- `/api/branch/*` — Branch operations (sales, payments, deposits, expenses, inventory)
- `/api/mis/*` — Management information system (audit, reconcile, branch-status, etc.)
- `/api/admin/*` — Admin operations (pending-registrations, approve/reject)
- `/api/users` — User management (admin only)
- `/api/employees` — Employee management
- `/api/clients` — Client management
- `/api/appointments` — Appointment management
- `/api/reports` — Report management
- `/api/health` — System health check

## Pricing Engine
- **client/src/lib/pricing.js** — Complete PRICE_LIST (91 products) with DP (Distributor Price), CP (Consumer Price), BV (Business Volume) values
- `findProductPrice(name)` — Fuzzy product lookup
- `enrichProductsWithPricing(products)` — Merge API products with PRICE_LIST pricing data
- `calculateCartTotals(cart, isMember)` — Cart calculation with DP/CP switching + BV tracking
- `generateReceiptNumber()` — Receipt number generation (RCP-YYYYMMDD-HHMM-XXXX)

## Portals (11 total, all with full business logic)
1. **Distributor** — Shop with DP pricing + BV tracking, checkout flow, Full Body Check Up, Media/News feed, Testimonials
2. **Front Desk** — Orders management (Pending/Processing/Shipped/Delivered/All status workflow), Appointment scheduling (create/complete/cancel), Full Body Checkup (form link + recent checkups), Client Registration with ID validation, Payment recording, Client Lookup, Delivery scheduling, Visitor Management (log/sign-in/sign-out/badges), CRM interaction logs, Notifications, Staff Communication (announcements + messages), Staff Services (leave/cash requests)
3. **Consultant** — Checkup review with report creation (diagnosis, prescriptions from PRICE_LIST, recommendations, follow-ups), Client management, Report detail views, Follow-up tracking (overdue/upcoming), Analytics stats, Leave requests
4. **Branch** — Walk-in Sales POS (member/non-member pricing, distributor search, cart with DP/CP/BV, payment methods, receipt generation, recent sales), Prescriptions (dispense workflow), Branch Stock view, Banking (deposit submission with validation), Payments, Online Orders (status workflow: Processing→Shipped→Delivered), Bonus payouts, Communication/Announcements, Staff listing, Distributor Registration (new/transfer/renewal), Field Program scheduling
5. **HR** — Employee directory (add/edit), Leave management (applications, approve/reject, types: Annual/Sick/Personal/Maternity), Warnings (Verbal/Written/Final), Terminations with confirmation, Attendance logging, Performance reviews (1-5 rating), Staff announcements, Data collection/export, Personal leave requests
6. **Finance** — Dashboard with branch selector + gradient KPI cards (Total Sales with Cash/Card breakdown, Deposits, BV Points, Gross Margin), comparison periods, Deposit verification (individual + batch verify with slip reference + bank match), Bonus workflow (CSV upload, review, approve/reject, export), Expenses tracking (form + categorized list), Staff Communication, Staff Services
7. **GM** — Enhanced dashboard with 4 gradient KPI cards (Revenue, CIF Deposits, BV Points, Gross Margin), Approval center with sub-tabs (All/Cash/Leave/Stock/Other requests), Campaign creation (dates, branches, discounts), Bonus History (date range filter, CSV export), Staff Communication (priority + target audience), Executive services
8. **Director** — Enhanced KPI dashboard (revenue, monthly, branches, distributors), Revenue trends, Branch performance comparison, Executive services
9. **MIS** — Audit trail, Reconciliation (date range + branch with discrepancy highlighting), Branch Status, Encoded Sales (manual entry from PRICE_LIST), Receipt search, Cross-branch stock levels with low-stock alerts, Product Catalog (full PRICE_LIST with DP/CP/BV/margins), Report drafts
10. **Stock** — Overview stats, Country Stock (import with batch/expiry), Windhoek/Ondangwa Warehouses (transfer in), Distribution (warehouse→branch), Transfer tracking (pending→dispatched→in_transit→delivered with action buttons), Inventory movements (filtered), Stock orders/requests (urgency levels), Inter-branch sharing rules, Country Inventory aggregate with CSV export, Invoices (PO creation + tracking), Valuation (stock value by location with PRICE_LIST), Barcode (product lookup with code generation), Reorder Alerts (configurable thresholds, Critical/Low/OK status), Batch Tracking (batch numbers, expiry alerts), Realtime (auto-refresh stock dashboard)
11. **Admin** — Staff Approvals (approve/reject), User Management (edit role/status/branch, delete with confirmation, role filter), Branch configuration (create new), System health + DB stats

## Role → Portal Access
- admin: all portals
- frontdesk: distributor, frontdesk
- consultant: consultant
- dispenser: distributor, frontdesk, branch
- branch_manager: distributor, frontdesk, branch
- hr_manager: hr
- finance: finance
- gm: distributor, frontdesk, consultant, branch, hr, finance, gm
- director: all except admin, mis, stock
- mis: mis
- stock: stock

## Database
- **40 tables** fully migrated: products, branches, online_orders, stock_batches, stock_transfers, branch_walkin_sales, branch_inventory_batches, warehouse_locations, towns, delivery_distances, users, distributors, clients, appointments, employees, and more
- Products table seeded with 95 products
- Branches seeded with 15 Namibian branches
- Warehouse locations auto-seeded: country_stock, windhoek_warehouse, ondangwa_warehouse
- Super Admin auto-seeded (username: admin, password: Admin@2024)

## Authentication
- JWT tokens in httpOnly cookies
- Auth middleware in server.js for all /api/* routes
- Public routes: login, logout, register, health, GET products/branches, POST orders/appointments
- Staff registration requires admin approval

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `AUTH_SECRET` — JWT signing secret (required)
- `PORT` — Server port (default 5000)
- `REALTIME_GATEWAY_URL` — WebSocket gateway URL (optional)

## Legacy Files (preserved)
- `dynapharm-complete-system.html` — Original monolithic SPA (preserved for reference)
- `assets/` — Static CSS, JS, images (still served for legacy pages)
