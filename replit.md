# Dynapharm Namibia Health Management System

## Overview
This project is a cloud-based health management system for Dynapharm International Namibia, aiming to streamline operations across sales, inventory, HR, finance, and CRM. It provides a comprehensive platform for managing products, distributors, branches, orders, and staff, enhancing efficiency, data accuracy, and business insights. Key capabilities include a multi-portal architecture, a robust e-commerce shop, detailed pricing and profit analysis, and extensive reporting features. The system seeks to digitize Dynapharm's operations, improve customer and distributor engagement, and provide real-time data for informed decision-making, leading to market expansion and increased profitability in Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is a React-based Single Page Application (SPA) built with Vite. It features a modular structure, context-based authentication (`AuthContext.jsx`) for role-based access to 11 distinct portals, and an API client (`api.js`) for backend communication. Styling is managed with Tailwind CSS v4, incorporating Dynapharm's corporate theme colors.

### Backend
The backend is an Express.js server providing API services and serving the React frontend in production. It uses file-based routing for API endpoints, JWT-based authentication with cookie-based sessions (`auth.js`), and a PostgreSQL connection pool with query helpers (`db.js`). All API routes utilize middleware for authentication, with specific public routes for non-authenticated access.

### Core Features
- **Multi-Portal System**: 12 distinct portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) with dedicated functionalities and UI/UX.
- **Role-Based Access Control**: Granular access control based on user roles.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with server-side validation.
- **Pricing Engine**: Comprehensive `PRICE_LIST` and `PACKAGE_DATABASE` for products and packages, including Distributor Price (DP), Consumer Price (CP), Business Volume (BV), and Cost Insurance Freight (CIF). Features fuzzy product lookup, profit calculation, and cart total calculation.
- **AI Stock Management System**: An AI-powered inventory intelligence system (`/stock` — StockPortal.jsx) with 20 tabs, including a Global Branch Selector, AI Command Center with real-time AI Insights, and an AI Reorder Tab using velocity-based demand forecasting. The `stockAI Engine` uses pure JS for its AI functionalities.
- **Distributor Management**: Functionality for distributor registration, bulk import, and agreement form management, including a shared `DistributorPerformanceTab` component.
- **Staff and User Management**: Tools for employee management, staff registration with admin approval, and user administration.
- **Reporting and Analytics**: Various dashboards and reports across portals providing insights into sales, profits, branch performance, and KPIs.
- **UI/UX Design**: Consistent Dynapharm branding with specific color schemes and gradient headers for different portals, clear navigation, and modal-based workflows.
- **Consultant Portal**: Provides comprehensive client management, checkup forms, reports, follow-ups, analytics, and staff services, matching a reference system (`dynapharm-complete-system.html`). Includes features for consultation fees, where non-members pay N$200 and members N$150, with a portion credited to the referral distributor and consultant.
- **Stock Management Workflow**: Supplier Import → Country Stock → Distribution to Warehouses → Warehouse Dispatch to Branch (GM approval) → Branch Receipt. Transfer statuses: `submitted`, `received`, `pending_approval`, `approved`, `rejected`, `delivered`, `returned`, `partially_received`. GM actions: Approve, Reject, Amend & Approve, Return for Correction. Branch receipt includes item-level receipt, e-signature, and discrepancy notes. Audit trail tracks all amendments.
- **Dispatch Note Document** (`client/src/components/DispatchNote.jsx`): Full operational stock document with 7 sections: A) Header (company, title, reference number, barcode, date, status, prepared by), B) Source/Destination (warehouse details, branch name/code/address/phone/region), C) Item Table (10 columns: #, Product Name, Product Code, Batch No, Expiry Date, Unit, Qty Prepared, Qty Approved, Qty Received, Remarks), D) Warehouse Notes, E) GM Approval Section (status, name, date, comment, amendment details with original vs approved values), F) Branch Receipt Section (received by, date, e-signature, receipt status, discrepancy flag), G) Audit Footer (created/approved/received timestamps and actors). Includes Code128 barcode SVG, print/PDF support. Used in GMPortal and BranchPortal.
- **DB columns for transfers**: `stock_transfer_items` (expiry_date, quantity_approved, quantity_received, discrepancy_note); `stock_transfers` (gm_action, gm_comment, amended_by_gm, amended_at, signature_name, branch_receipt_note, discrepancy_flag, receipt_status)

### Database
A PostgreSQL database with 40 fully migrated tables, including products, branches, users, and distributors (12,500+ records). Key data is pre-seeded, and a super admin user is auto-seeded.

### Authentication
Authentication is optional; all portals are accessible without login. JWT tokens stored in httpOnly cookies provide user identity when logged in. The system functions gracefully without authentication, with API routes being public by default. Both staff and distributor registrations require admin approval.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Tailwind CSS v4**: CSS framework.
- **XLSX.js**: For bulk distributor import.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.