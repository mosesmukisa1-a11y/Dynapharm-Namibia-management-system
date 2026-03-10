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
- `/api/distributors` — Distributor management
- `/api/stock/*` — Stock transfers, batches, requests
- `/api/branch/*` — Branch operations (sales, payments, expenses, inventory)
- `/api/mis/*` — Management information system reports
- `/api/health` — System health check

## Database
- **40 tables** fully migrated: products, branches, online_orders, stock_batches, stock_transfers, branch_walkin_sales, branch_inventory_batches, warehouse_locations, towns, delivery_distances, users, distributors, clients, appointments, employees, and more
- Products table seeded with 95 products (Dynapharm price list)
- Branches table and distributors table both seeded with 15 Namibian branches
- Towns (20) and delivery distances seeded for delivery fee calculations
- Migration SQL files in `migrations/` and `backend/`

## Authentication
- JWT tokens stored in httpOnly cookies
- Auth middleware in server.js enforces auth on all `/api/*` routes except public ones
- Public routes: login, logout, health, distributor-login, orders, delivery, GET products/branches
- Requires `AUTH_SECRET` (or `JWT_SECRET` or `SESSION_SECRET`) environment variable

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `AUTH_SECRET` — JWT signing secret (required)
- `REALTIME_GATEWAY_URL` — WebSocket gateway URL (optional)
- `PORT` — Server port (default 5000)

## Frontend
- Main application: `dynapharm-complete-system.html` (monolithic SPA)
- Individual portals: `gm-portal.html`, `hr-portal.html`, `mis-portal.html`, etc.
- Landing page: `index.html`
