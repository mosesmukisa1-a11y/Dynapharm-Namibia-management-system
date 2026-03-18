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

## Portals (11 total)
1. **Distributor** — Shop, Full Body Check Up, Media, Testimonials
2. **Front Desk** — Appointments, Checkup, Client Registration, Payments, Lookup, Delivery, CRM, Notifications, Staff Services
3. **Consultant** — Checkup Forms, Clients, Reports, Follow-ups, Analytics, Staff Services
4. **Branch** — Walk-in Sales, Prescriptions, Stock, Banking, Payments, Online Orders, Bonus, Communication, Staff, Distributor Registration, Field Program
5. **HR** — Employees, Leave, Warnings, Terminations, Attendance, Performance, Communication, Data Collection, Staff Services
6. **Finance** — Dashboard, Deposit Inbox, Bonus Workflow, Staff Services
7. **GM** — Dashboard KPIs, Approvals, Campaigns, Staff Services
8. **Director** — Executive Dashboard, Staff Services
9. **MIS** — Audit, Reconcile, Branch Status, Encoded Sales, Receipts, Stock, Catalogs, Drafts
10. **Stock** — Overview, Country Stock, Windhoek/Ondangwa Warehouses, Distribution, Transfers, Inventory, Orders, Sharing, Country Inventory
11. **Admin** — Staff Approvals, User Management, Branches, System Health

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
