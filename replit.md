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

## Shop Flow
- **Member/Non-Member Selection**: Landing page asks customer type before showing products
- **Member (DP)**: Must select NB number from distributor list; gets Distributor Price + BV tracking
- **Non-Member (CP)**: Optional referral field, defaults to "Dynapharm Namibia (NB005676)"; gets Consumer Price
- **Checkout**: Name + phone required; delivery method (pickup/delivery); payment method (cash/card/mobile/bank)
- **Orders API**: Only customer_name + items[] required; delivery_method defaults to 'pickup'; subtotal recomputed server-side from items

## Key API Routes
- `/api/auth/login` — POST, user login
- `/api/auth/logout` — POST, clear session
- `/api/auth/me` — GET, current user profile
- `/api/auth/register` — POST, staff registration (pending approval)
- `/api/products` — CRUD for products (GET is public)
- `/api/branches` — CRUD for branches (GET is public)
- `/api/orders` — Order management (POST public for shop; subtotal recomputed server-side)
- `/api/distributors` — Distributor management (GET is public)
- `/api/distributor-agreement` — Distributor Agreement Form (POST public for registration; GET/PUT require auth with role checks)
- `/api/distributor-import` — Bulk distributor import from CSV/Excel (POST, admin/director/gm role required)
- `/api/notifications` — Notification system
- `/api/stock-batches` — Stock batch management (returns dual field names: camelCase + snake_case aliases for frontend compatibility)
- `/api/stock-movements` — Warehouse + branch stock movements (combined from warehouse_inventory_movements and stock_movements tables)
- `/api/field_program_requests` — Field program activities (CRUD, requires auth)
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
- **client/src/lib/pricing.js** — Complete PRICE_LIST (91 products) with DP (Distributor Price), CP (Consumer Price), BV (Business Volume), CIF (Cost Insurance Freight from Malaysia) values
- `findProductPrice(name)` — Fuzzy product lookup (exact match → partial match → 60% word match)
- `getCIFPrice(productName)` — Get CIF import price for a product
- `getProductProfit(productName, campaignPrice?)` — Calculate profit: selling price - CIF, with margin %
- `enrichProductsWithPricing(products)` — Merge API products with PRICE_LIST pricing data (includes CIF)
- `calculateCartTotals(cart, isMember)` — Cart calculation with DP/CP switching + BV tracking
- `generateReceiptNumber()` — Receipt number generation (RCP-YYYYMMDD-HHMM-XXXX)
- **CIF pricing**: ~42.5% of DP price; represents import cost from Dynapharm International Malaysia
- **Profit visibility**: CIF prices and profit data restricted to admin/gm/director roles only

## Official Branches (15 outlets)
Windhoek CBD, Tsumeb, Gobabis, Swakopmund, Outapi, Okahao, Oshakati, Otjiwarongo, Eenhana, Ondangwa, Rundu, Walvis Bay, Hochlandpark, Khomasdal, Katima Mulilo
- Full details (addresses + phone) in `BRANCH_DETAILS` constant
- `WINDHOEK_BRANCHES` = ['Windhoek CBD', 'Hochlandpark', 'Khomasdal']
- `DELIVERY_FEE_RULES`: Windhoek = free, outside = N$150
- `COMPANY_INFO`: Company name, logo, social media links, default referral

## Portals (12 total, all with full business logic)
1. **Distributor** — Dashboard (profile, order stats, BV, quick actions), Shop with DP pricing + BV tracking, New Member Registration (Distributor Agreement Form for recruiting downlines), BV & Profit (monthly breakdown, accumulation guide), Communications (view announcements, compose messages to admin), Full Body Check Up, Media/News, Testimonials
2. **Front Desk** — Orders (5 status sub-tabs), Appointments, Full Body Checkup, Client Registration, Payments, Client Lookup, Delivery, Visitors, CRM, Notifications, Staff Communication, Staff Services
3. **Consultant** — Checkup review with report creation (diagnosis, prescriptions from PRICE_LIST, recommendations, follow-ups), Client management, Reports, Follow-ups, Analytics, Staff Services
4. **Branch** — Full reference-system branding across ALL 11 tabs. Common elements: "🏬 Branch Portal" centered title, blue gradient active tabs (linear-gradient #3498db→#2980b9) with red bottom border (3px #c41e3a). Every tab has blue gradient header banner (linear-gradient #1e3a5f→#2980b9). Walk-in Sales: green "➕ New Walk-in Sale" button, customer type info cards (blue #ebf5fb for Registered Client, yellow #fef9e7 for New Customer), POS with member/non-member flow, "Current Sale" panel with blue gradient header, Sale Complete green gradient header. Prescriptions: green gradient header (#27ae60→#1e8449). Stock: purple/blue hero header with gradient action buttons. Banking: "🏦 Banking Operations" banner + 4 big action buttons grid (Make Deposit green, Cash Drawer blue, Record Expense orange, Banking History gray). Payments: "💳 Payment Management" banner + search bar + "➕ Record Payment" green + "🔄 Refresh" blue buttons. Online Orders: "🛍️ Online Orders" banner + two-column layout (📥 Receiving + 📦 Dispensing panels). Bonus: "🎁 Bonus Payouts" banner + month picker + NB/Name search + Refresh. Communication: "💬 Staff Communications" banner + filter tabs (All/HR/GM/Director/Finance/Front Desk/MIS) + inbox + send form with recipient checkboxes + Select All/Clear. Staff: "👤 Staff Services" banner + two service cards (📅 Leave Management green card, 💵 Cash Requests blue card). Distributor Registration: MembershipAgreementForm component. Field Program: "🚐 Field Program - Stock Requests" banner + "➕ New Stock Request" red button + request list + modal with distributor verification, product rows, T&C with FEFO compliance, signature
5. **HR** — Employees, Leave management, Warnings, Terminations, Attendance, Performance, Communication, Data Collection, Staff Services
6. **Finance** — Dashboard (real CIF cost KPIs, branch selector), Remittance (supplier payment tracking with "No Remittance Due" status), Deposit Inbox (batch verify), Bonus Workflow, Expenses, Communication, Staff Services
7. **GM** — Dashboard (Total Sales, CIF Cost of Sales, Gross Profit, Remittance Due — real CIF via findProductPrice), P&L Summary, Approvals (sub-tabs), Campaigns, Bonus History, Communication, Staff Services
8. **Director** — Executive Dashboard (real CIF/profit/remittance KPIs), P&L Overview (Revenue/CIF/Profit/Deposits/Remittance), Branch Performance (with profit column), Branch Overview, Distributor Network, Staff Services
9. **MIS** — Audit, Reconcile, Branch Status, Encoded Sales, Receipts, Stock, Catalogs, Drafts
10. **Stock** — Overview, Supplier Import (mandatory fields: product, carton_no, expiry_date, qty, batch_number with red validation), Country Stock (with CIF pricing), Windhoek/Ondangwa Warehouses, Distribution (stock release rules: cash received OR field program approved; barcode scan support), Transfers, Inventory, Orders, Monthly Sales (aggregated by month), Profit Analysis (CIF vs DP, GM/Director/Admin only), Country Inv, Valuation, Barcode, Reorder, Batch, Realtime
11. **Admin** — Staff Approvals, User Management (+ password reset), Products & Photos (upload images), Distributor List (add/search, CSV/Excel bulk import with XLSX.js), Branches, System
12. **Training** — Training Materials, Videos, Photos, Upload Content (trainers only), Schedule

## Role → Portal Access
- admin: all portals (including training)
- frontdesk: distributor, frontdesk
- consultant: consultant
- dispenser: distributor, frontdesk, branch
- branch_manager: distributor, frontdesk, branch
- hr_manager: hr
- finance: finance
- gm: distributor, frontdesk, consultant, branch, hr, finance, gm, stock
- director: distributor, frontdesk, consultant, branch, hr, finance, gm, director, stock
- mis: mis
- stock: stock
- training: training, distributor

## API Field Naming Convention
- All API normalizers return **dual field names** (both camelCase and snake_case aliases) for frontend compatibility
- Example: stock-batches returns both `description` and `product_name`, both `batchNo` and `batch_number`, both `importDate` and `created_at`
- Appointments API uses ILIKE for type filtering (case-insensitive partial match)
- Frontend portals consume snake_case field names (`full_name`, `created_at`, `branch`, `unit_price`)

## Database
- **40 tables** fully migrated: products, branches, online_orders, stock_batches, stock_transfers, branch_walkin_sales, branch_inventory_batches, warehouse_locations, towns, delivery_distances, users, distributors, clients, appointments, employees, and more
- Distributors table has 12,500+ records (bulk imported from Excel); columns include `position`, `position_code`, `date_joined`, `sponsor_code`, `sex`, `level`
- Products table seeded with 95 products
- Branches seeded with 15 Namibian branches
- Warehouse locations auto-seeded: country_stock, windhoek_warehouse, ondangwa_warehouse
- Super Admin auto-seeded (username: admin, password: Admin@2024)

## Authentication
- JWT tokens in httpOnly cookies
- Auth middleware in server.js for all /api/* routes
- Public routes: login, logout, register, health, GET products/branches, POST orders/appointments
- **Staff registration**: via LoginModal (Staff Access), requires admin approval
- **Distributor registration**: via DistributorLoginModal (Distributor Access), uses NB number lookup to auto-fill name from distributors table, requires admin approval
- Admin can approve/reject both staff and distributor registrations from the Admin Portal "Staff Approvals" tab (with All/Distributors/Staff filter)
- Admin can reset passwords for any user from the "User Management" tab

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `AUTH_SECRET` — JWT signing secret (required)
- `PORT` — Server port (default 5000)
- `REALTIME_GATEWAY_URL` — WebSocket gateway URL (optional)

## Legacy Files (preserved)
- `dynapharm-complete-system.html` — Original monolithic SPA (preserved for reference)
- `assets/` — Static CSS, JS, images (still served for legacy pages)
