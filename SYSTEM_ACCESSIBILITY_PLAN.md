# 🔐 System Accessibility & Role-Based Portal Access Plan

## Current State
- All portals visible to everyone (tabs at top)
- Each portal has separate login
- No unified entry point
- Role-based access exists but portals are always visible

## Proposed Solution (Inspired by dynapharm.net/ph/)

### 1. **Three User Types**
- **Visitors** - No login required, can access:
  - Shop (Distributor/Guest Portal - Shop tab)
  - Full Body Check-Up booking
  
- **Distributors** - Login via Distributor Portal:
  - Distributor Dashboard (distributor-portal.html)
  - View referrals, profits, BVs, bonuses
  - Access shop with distributor pricing
  
- **Staff** - Login via unified Staff Portal:
  - See only portals they have access to based on role
  - Single login for all authorized portals
  - Role-based tab visibility

### 2. **Role-to-Portal Mapping**

| Role | Accessible Portals |
|------|-------------------|
| `admin` | All portals |
| `consultant` | Consultant Portal, Front Desk (read-only) |
| `dispenser` | Branch Portal, Front Desk |
| `branch_manager` | Branch Portal, Front Desk, MIS Portal |
| `finance` | Finance Portal |
| `hr_manager`, `hr_admin` | HR Portal |
| `gm` | GM Portal, Analytics Portal |
| `director` | Director Portal, GM Portal (read-only), Analytics Portal |
| `mis` | MIS Portal |
| `stock` | Stock Management Portal |

### 3. **Implementation Plan**

#### Phase 1: Unified Login Page
- Create login modal/overlay on page load
- Allow visitors to "Continue as Guest" to access shop
- Staff login shows their authorized portals
- Distributor login redirects to distributor-portal.html

#### Phase 2: Dynamic Portal Visibility
- Hide all portal tabs initially
- After login, show only authorized portals
- Store user session in localStorage
- Check permissions on page load

#### Phase 3: Admin Portal Permissions
- Add "Portal Permissions" section in Admin Portal
- Allow admin to assign portal access to roles
- Store permissions in database/localStorage

### 4. **User Experience Flow**

**Visitor Flow:**
```
Landing Page → "Continue as Guest" → Shop Tab Only
```

**Distributor Flow:**
```
Landing Page → "Distributor Login" → Distributor Dashboard
```

**Staff Flow:**
```
Landing Page → "Staff Login" → Unified Login → 
Shows Only Authorized Portals → Can Switch Between Portals
```

### 5. **Benefits**
✅ Better security - users only see what they can access
✅ Cleaner interface - no confusion about which portal to use
✅ Single login - one credential for all authorized portals
✅ Professional appearance - similar to dynapharm.net/ph/
✅ Easy management - admin controls all permissions

