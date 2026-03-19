# Dynapharm Namibia Health Management System

## Overview
This project is a cloud-based health management system designed for Dynapharm International Namibia. It aims to streamline operations across various departments, including sales, inventory, human resources, finance, and customer relations. The system provides a comprehensive platform for managing products, distributors, branches, orders, and staff, with a focus on improving efficiency, data accuracy, and business insights. Key capabilities include a multi-portal architecture for different user roles, a robust e-commerce shop, detailed pricing and profit analysis, and extensive reporting features. The business vision is to digitize and optimize Dynapharm's operations, enhance customer and distributor engagement, and provide management with real-time data for informed decision-making, ultimately leading to market expansion and increased profitability within Namibia.

## User Preferences
I prefer clear and concise communication.
I value an iterative development approach, with regular updates and opportunities for feedback.
Please ask for confirmation before implementing any major changes or architectural decisions.
Ensure that explanations are detailed enough for me to understand the implications of changes.
Do not make changes to the folder `assets/`.
Do not make changes to the file `dynapharm-complete-system.html`.

## System Architecture

### Frontend
The frontend is built using React with Vite, forming a Single Page Application (SPA). It features a modular structure with shared UI components, context-based authentication (`AuthContext.jsx`) for role-based access to 11 distinct portals and public pages, and an API client (`api.js`) for backend communication. Styling is managed with Tailwind CSS v4, incorporating Dynapharm's corporate theme colors (primary red, secondary, and accent colors). Vite is used for development and bundling, with production output served by the Express backend.

### Backend
The backend is an Express.js server responsible for serving the API and the React frontend in production. It employs file-based routing for API endpoints, a JWT-based authentication system with cookie-based sessions (`auth.js`), and a PostgreSQL connection pool with query helpers (`db.js`). All API routes utilize middleware for authentication, with specific public routes defined for non-authenticated access.

### Core Features
- **Multi-Portal System**: 12 distinct portals (Distributor, Front Desk, Consultant, Branch, HR, Finance, GM, Director, MIS, Stock, Admin, Training) each with dedicated functionalities and UI/UX.
- **Role-Based Access Control**: Granular access control based on user roles, determining portal visibility and feature permissions.
- **E-commerce Shop**: Supports both member (Distributor Price + BV tracking) and non-member (Consumer Price) purchasing flows with various payment and delivery options. Server-side validation recalculates subtotals to ensure accuracy.
- **Pricing Engine**: Comprehensive `PRICE_LIST` for 91 products, including Distributor Price (DP), Consumer Price (CP), Business Volume (BV), and Cost Insurance Freight (CIF). Features fuzzy product lookup, profit calculation, and cart total calculation with DP/CP switching. CIF pricing and profit data are restricted to specific high-level roles.
- **Stock Management**: Detailed tracking of stock batches, movements between warehouses and branches, supplier imports, and stock transfers. Includes FEFO compliance for field program stock requests.
- **Distributor Management**: Functionality for distributor registration (with NB number lookup), bulk import, and agreement form management.
- **Staff and User Management**: Tools for employee management, staff registration with admin approval workflows, and user administration (e.g., password reset).
- **Reporting and Analytics**: Various dashboards and reports across portals (e.g., GM, Director, Finance) providing insights into sales, profits, branch performance, and KPIs, often leveraging real CIF costs.
- **UI/UX Design**: Consistent use of Dynapharm branding with specific color schemes and gradient headers for different portals, clear navigation, and modal-based workflows (e.g., POS system) for enhanced user experience. Dual field naming (camelCase and snake_case) is supported by the API for frontend compatibility.

### Database
The system utilizes a PostgreSQL database with 40 fully migrated tables, including products, branches, users, distributors (12,500+ records), and various operational tables. Key data like products, branches, and warehouses are pre-seeded. A super admin user is auto-seeded for initial setup.

### Authentication
Authentication is managed via JWT tokens stored in httpOnly cookies. All `/api/*` routes are protected by auth middleware, with exceptions for public endpoints. Both staff and distributor registrations require admin approval, which can be managed through the Admin Portal.

## External Dependencies
- **PostgreSQL**: Primary database for all system data.
- **Tailwind CSS v4**: CSS framework for styling the frontend.
- **XLSX.js**: Used for bulk distributor import from CSV/Excel files in the Admin portal.
- **Vite**: Frontend build tool.
- **Node.js/Express.js**: Backend runtime and web framework.

## Consultant Portal
The Consultant Portal (`/consultant`) provides comprehensive client management, checkup forms, reports, follow-ups, analytics, and staff services. It matches the reference system (`dynapharm-complete-system.html`) with:
- **Red gradient header** (#c41e3a → #a01830) with logo, title, and Refresh Data button
- **6 navigation tabs** with red active underline: Checkup Forms, Clients, Reports, Follow-ups, Analytics, Staff Services
- **Checkup Forms**: Lists appointments with status badges (color-coded), Upcoming/Completed toggle pills, View Details overlay (700px modal), status update buttons (Check In, Start Checkup, Mark Complete), Create Report action
- **Clients**: Rich client cards with membership badges (Member/Referred), branch badges, personal info grid, View Details/Edit/Print actions; Client detail modal with personal info, member/referral info, health info, symptoms, registration details; Edit form with full field set
- **Reports**: Searchable list with prescription badges, report detail modal with diagnosis/recommendations/prescriptions/follow-up date
- **Follow-ups**: Color-coded cards (overdue=red, due today=yellow, upcoming=blue) with Complete/Reschedule actions
- **Analytics**: 4 metric cards (Total Clients/Reports Created/Follow-ups Due/Member Conversion) with colored left borders matching reference; Client Distribution and Follow-up Compliance sections with progress bars
- **Staff Services**: Leave Management and Cash Support cards with Request/View modals; Leave form (type/dates/reason/urgent); Cash form (amount/purpose/urgent); Request history display with status badges
- **API endpoints**: `/api/leave-requests` and `/api/cash-requests` (GET/POST) for staff service requests (in-memory storage)
- **API fix**: `appointments.update` and `clients.update` now send `id` in request body (not URL path) to match backend handler expectations