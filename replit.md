# Dynapharm Namibia Health Management System

## Overview
Cloud-based health management system for Dynapharm International Namibia. Built with Node.js/Express backend serving both API endpoints and static HTML frontend files.

## Architecture
- **server.js** — Express server (port 5000), serves static files and API routes
- **api/** — API route handlers (file-based routing, each .js file = one endpoint)
- **api/_lib/auth.js** — JWT authentication library (cookie-based sessions)
- **api/db.js** — PostgreSQL connection pool and query helpers
- **assets/** — Static CSS, JS, images
- **web-modules/** — Frontend JS modules

## Key API Routes
- `/api/auth/login` — POST, user login
- `/api/auth/logout` — POST, clear session
- `/api/auth/me` — GET, current user profile
- `/api/products` — CRUD for products (GET is public)
- `/api/branches` — CRUD for branches (GET is public)
- `/api/orders` — Order management
- `/api/distributors` — Distributor management (GET is public for search; search also queries `users` table for distributor-role users; results sorted with individual distributors before branch records)
- `/api/notifications` — Notification system (GET/PUT public with recipient_id required; POST/DELETE require auth). Used for distributor referral notifications.
- `/api/stock/*` — Stock transfers, batches, requests
- `/api/branch/*` — Branch operations (sales, payments, expenses, inventory)
- `/api/mis/*` — Management information system reports
- `/api/health` — System health check

## Database
- **40 tables** fully migrated: products, branches, online_orders, stock_batches, stock_transfers, branch_walkin_sales, branch_inventory_batches, warehouse_locations, towns, delivery_distances, users, distributors, clients, appointments, employees, and more
- Products table seeded with 95 products (Dynapharm price list)
- Branches table and distributors table seeded with 15 Namibian branches + 10 sample individual distributors (NB001544-NB010333) with entity_type='individual'
- Towns (20) and delivery distances seeded for delivery fee calculations
- Migration SQL files in `migrations/` and `backend/`

## Authentication
- JWT tokens stored in httpOnly cookies
- Auth middleware in server.js enforces auth on all `/api/*` routes except public ones
- Public routes: login, logout, register, health, distributor-login, orders, delivery, GET products/branches
- Requires `AUTH_SECRET` (or `JWT_SECRET` or `SESSION_SECRET`) environment variable
- Super Admin account auto-seeded on startup (username: admin, password: Admin@2024) if no admin exists
- Staff Sign Up: POST `/api/auth/register` — creates inactive user (name, DOB, role, password); username auto-generated
- Admin Approval: GET `/api/admin/pending-registrations`, POST `/api/admin/approve-registration`, POST `/api/admin/reject-registration`
- Staff roles: frontdesk, consultant, dispenser, branch_manager, finance, hr_manager, gm, director, mis, stock
- Admin role has access to all portals; each role maps to specific portal(s) via ROLE_PORTAL_ACCESS

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `AUTH_SECRET` — JWT signing secret (required)
- `REALTIME_GATEWAY_URL` — WebSocket gateway URL (optional)
- `PORT` — Server port (default 5000)

## Frontend
- Landing page: `index.html` — single entry point with hero (Online Shop + Full Body Check Up buttons), navbar with Dynapharm logo (About/Network/Global/Testimonials/Distributor Login/Staff Login)
- Portal application: `dynapharm-complete-system.html` — monolithic SPA (Online Shop, Full Body Check Up tabs, staff portals after login)
- Portal has streamlined navbar with Dynapharm logo (Home → index.html, Shop, Health Check, Staff Login) — no duplicate hero/welcome
- Logo: `assets/dynapharm-logo.png` — displayed in navbar (all pages), checkup form header, distributor portal login/dashboard, preview/print output
- Hash routing: `#client`/`#shop` → Online Shop tab, `#checkup` → Health Check tab, `#testimonials` → Shop tab
- Staff Login from landing page uses sessionStorage flag to auto-open login modal on portal (landing page hidden during staff login flow — user goes straight to login modal)
- Staff login modal has Login / Sign Up tabs; Sign Up collects name, DOB, position, password (pending admin approval)
- Admin portal has "Staff Registration Approvals" section to approve/reject pending signups
- Full Body Check Up form: Preview/Print/Submit buttons. Preview opens modal with formatted table (XSS-safe HTML escaping). Print opens new window with logo, structured sections (handles popup-block). Modal closable via Close button, Esc key, or backdrop click. Declaration checkbox replaces signature pad — captures client full name, initials, and date as acknowledgment on preview/print. Appointment POST is public (no auth required). API supports `type` query filter.
- Consultant Portal: Redesigned with branded header and tabbed navigation (Checkup Forms, Clients, Reports, Follow-ups, Analytics, Staff Services). Consultant role restricted to only their own portal (no frontdesk/client tabs). openTab enforces ROLE_PORTAL_ACCESS authorization. Checkup Forms section shows submitted forms filtered by the consultant's branch. Split into Upcoming/Completed pill toggles. Cards show View Details (opens preview modal at z-index 99999), Create Report (bridges to report modal with prescription), Check In, Start, Mark Complete. Branch ID `townshop` = Windhoek CBD. `createReportFromCheckup(aptId)` creates a temp client entry and opens the existing `reportModal`. On report save, appointment status auto-updates to `in_progress`. Saved reports with prescriptions appear in branch portal's Prescriptions tab for dispensing.
- Staff login hides Shop/Health Check nav links; logout restores them.
- Distributor Portal: `distributor-portal.html` — tabbed auth (Login / Sign Up / Forgot Password), logo on login card and dashboard header
  - Login: NB number + password (POST `/api/distributor-login`, JWT cookie)
  - Sign Up: select distributor from 12K+ dropdown, DOB, email, password (POST `/api/distributors/set-password`, first-time only — rejects if account exists, verifies DOB)
  - Forgot Password: NB number + email + DOB + new password (POST `/api/distributors/forgot-password`, verifies all three fields match)
- `distributor-guest.html` is a health consultation booking form (separate from distributor login)
- Individual portals: `gm-portal.html`, `hr-portal.html`, `mis-portal.html`, etc.
